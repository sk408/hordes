// HORDES — auto-playing survivors-like. Entry point & game loop.
import {
  CONFIG as C, UPGRADES,
  DRAFT_LADDER, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES,
  ladderHp, ladderDmg, ladderXp, ladderGroups, ladderEliteChance, ladderBeats, runClock,
  volleyProjectileCap, midBossHp,
} from './config.js';
import { makePlayer, makeProjectile, makeGem, hpScale, xpScale, applyEscalation, clampLootToArena, lootLimit, contactHitDamage, pushGroundCapped } from './entities.js';

// ---------- M3 (audit 2026-09-16): ground-item overflow caps ----------
// The three ground arrays were unbounded (10k corpses -> 10k gems, three
// O(n) scans/frame). EVERY push now routes through one of these wrappers:
//   pushGem / pushDrop — merge-on-overflow into the NEAREST same-kind item
//     (entities.js pushGroundCapped), VALUE-PRESERVING: gems sum xp; potions
//     merge into a count the pickup path pays out in full (below cap, plain
//     push — single-item behaviour byte-identical).
//   pushItemDrop — the DISCLOSED FALLBACK: rare equippables are unique, a
//     merge would destroy one, so the OLDEST drop gives way at ITEM_CAP.
// No magnetism, no auto-collect — reachability and pickup rules unchanged.
function pushGem(gm) {
  return pushGroundCapped(state.gems, gm, C.GROUND_ITEMS.GEM_CAP,
    () => 'gem', (s, n) => { s.xp += n.xp; });
}
function pushDrop(d) {
  return pushGroundCapped(state.drops, d, C.GROUND_ITEMS.DROP_CAP,
    x => x.kind, (s, n) => { s.count = (s.count || 1) + (n.count || 1); });
}
function pushItemDrop(d) {
  if (state.itemDrops.length >= C.GROUND_ITEMS.ITEM_CAP) state.itemDrops.shift();
  state.itemDrops.push(d);
}
import { Renderer, prologueOkRect, prologueSkipRect } from './render.js';
import { AutoPilotController, PlayerController } from './controllers.js';
import { useSkill, usePotion, updateResources, updateUlts, ultCharge } from './skills.js';
import {
  rollItem, applyAffixes, STAT_DEFAULTS, MAX_EQUIPPED, PAID_CHESTS, rollPaidChest,
  decideEquip, flashTargets, shouldFlashDrop, describeFlash,
  adaptiveDropFactor, ewmaKillRate,
} from './loot.js';
import { refillHealBudget, healFromBudget } from './heal.js';
import { spawnArch, tickArches, activeArchMods, ARCH_TYPES } from './arches.js';
import {
  WEAPON_TYPES, WEAPONS, makeWeapon, updateWeapons, WEAPON_NAMES, WEAPON_MAX_LEVEL,
  levelUpWeapon, describeWeaponLevel, collectWeaponXp, weaponLevelParams, PIERCE_ALL,
} from './weapons.js';
// WAVE-11 pure modules (hb6/hb8/hb5): rolls + math only — this file owns all
// mutation, stamping, drift and rendering on top of their contracts.
import { rollEliteModifier, applyEliteModifier, splitChildren } from './elite_mods.js';
import { seedShrines, shrineBlessing, canAfford } from './shrines.js';
import { createAtlas, atlasUpdate, atlasRegisterLandmark } from './atlas.js';
import { detectSynergies, describeSynergy } from './synergies.js';
import { WEAPON_ICONS, WEAPON_ICON_PALETTE } from './sprites.js';   // WAVE-12 stats icons
import { ENEMY_TYPES, makeTypedEnemy, decideEnemyAction, rollVariant, deathShockwave, flyingZ } from './enemy_types.js';
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
// G21 slice 1: + the ONE on-weapon-hit rider writer and AFTERSHOCK's echo tick.
import {
  rewriteCards, hasRewrite, rewriteBoom, boomBlast, harvestBlast, applyBlast, REWRITES,
  onWeaponHit, tickRewriteEchoes, directHitMult, wildfireTransfer, stormReaperBlast,
} from './rewrites.js';
import {
  rollWeather, initWeather, update as updateWeather, mods as weatherMods, windDrift, mulberry32,
} from './weather.js';
import { evolveWeapon, describeEvolution, EVOLUTION_DEFS } from './evolutions.js';
import { pickBossForWave, decideBossAction, MIDBOSS } from './bosses.js';
import { recordEncounter, seenCount, totalEncounters, bestiaryModel } from './encounters.js';
import { rollRarity, applyRarity, effectiveTierId, RARITY } from './rarity.js';
import { Tour, TOUR_KEYS, tourFlag, setTourFlag, clearTourFlags } from './tour.js';
// ONBOARDING REWORK (owner-approved 2026-09-16): the engine for the
// non-pausing, non-capturing hint strip + object tags (see its header for
// the six invariants).
import { HintStrip, makeHintStore, HINT_IDS } from './onboarding.js';
import { introLine, controlById, CONTROLS } from './controls_ref.js';
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
import { paintOfferArt } from './draft_card_art.js';
import * as INTRO from './intro.js';
import * as CINE from './portal_cine.js';
// G15 THE DEATH MOVIE: a short, skippable cinematic on DEATH ONLY (never on
// the win or the deliberate exit), composed BEFORE and handing back to the
// WAVE-26 payoff overlay — it never replaces it. Structure mirrors the portal
// cine; the whole movie lives in its own file (one writer per file).
import * as DCINE from './death_cine.js';
// V1 THE ESCAPE SEQUENCE: the side-scrolling change of pace owns its whole
// world in src/escape/ (sim, generator, auto controller, render, payout). The
// integration is this import plus ONE frame branch, ONE keydown/keyup branch,
// ONE pointer route and ONE hook in endPortalCine — a narrow seam by house
// rule; the escape never touches the overhead movement, p.stats or the draft.
import * as ESCAPE from './escape/index.js';
// P2B99: the escape's touch pads are CANVAS-DRAWN — the help-placement ladder
// below cannot see them in the DOM, so their rects come in explicitly (the
// same "every help-mode surface must clear the controls" rule, extended to
// the escape's own controls).
import { LEFT_RECT, RIGHT_RECT, JUMP_RECT, DASH_RECT, KICK_RECT, MODE_RECT, SKIP_RECT }
  from './escape/render.js';
import {
  HEAT_CAP, HEAT_CURVES, heatMultipliers, goldMult, describeHeat, describeHeatPayout,
  heatXpMult, heatOf, manualPushes, addHeat, initHeat,
} from './heat.js';
import {
  loadProfileResult, saveProfile, makeProfile,
  GOLD_TIER, purseTier, purseValue, RUN_GOLD,
  SHOP_UPGRADES, upgradeCost, buyUpgrade, startWeaponSlots, STARTER_WEAPONS,
  CHARACTERS, unlockCharacter, equipCharacter, weaponUnlocked, shopRowOwned,
  applyMetaBonuses, applyCharacter, startPotionCount, hasArcadePass,
  // G19 slice 1: the per-character upgrade layer — the table, the buy path,
  // the pure applicator (run + preview seams), and the satchel's shared bonus.
  CHARACTER_UPGRADES, buyCharacterUpgrade, applyCharacterUpgrades,
  getCharacterUpgradeLevel, characterPotionBonus,
  // G19 slice 2: the family specialty — terms for the two damage chokes and
  // the derived STRONG/WEAK identity lines the screens render.
  specialtyOutgoingMult, specialtyIncomingMult, specialtyLines,
  // G25 slice 1: the apex tier — its OWN array (never inside SHOP_UPGRADES),
  // the derived gate, the buy path, and the sanctioned toggle pair.
  APEX_UPGRADES, apexOwned, apexUnlocked, buyApex, apexEnabled, setApexEnabled,
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
import { TROPHY_ART, CHARACTER_PORTRAITS, shopIcon, apexArt, APEX_FALLBACK_ID } from './art/index.js';
import { composeMenuFrame, MENU_FRAME_PALETTES, MENU_FRAME_SHADOW } from './art/menu_frame.js';
import {
  DEFAULT_CHALLENGE_ID, CHALLENGE_IDS, challengeOf, isStandard,
  challengeRules, nextChallengeId, describeChallenge, challengeGoldBonusPct,
} from './challenges.js';
// G20a STAGES — the third axis (the PLACE): pool/mods/hazard rows stamped onto
// the run exactly like challenges are. Same purity contract, same session-
// scoped pending selection, nothing persisted.
import {
  DEFAULT_STAGE_ID, STAGES, stageOf, stageMods, isDefaultStage,
  nextStageId, describeStage, lockedStageLines, stageRelief, stageFactsLine,
} from './stages.js';
// ARENA ELEVATED PATHS (scale-up 2026-09-17): the deterministic height field
// and its three reads — the grade term (player + enemies, the same pure
// function), the exposure bias (spawn azimuth on high ground), and the vision
// radius (the radar's world reach). See src/relief.js for the contract.
import {
  reliefLevel, reliefGrade, reliefUphillAzimuth, reliefBiasAngle,
  reliefLevelAt, reliefStep, reliefRampRoute,
} from './relief.js';

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
// S2 (audit 2026-09-16): the init above runs at MODULE LOAD, before any user
// gesture — on a gesture-gated browser (iOS Safari) the context is created
// suspended and stays that way: a permanently silent game. init() is
// idempotent and resumes a suspended context, so re-enter it on user input.
// Called from the keydown/pointerdown handlers below; never throws, never
// blocks gameplay, and constructs at most the one context init() ever does.
function audioUnlockGesture() {
  try { audio.init(); } catch { /* never block gameplay */ }
}

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
// MOBILE EMBED LAYOUT (owner 2026-09-15, docs/briefs/MOBILE_EMBED_LAYOUT.md
// ROUND 4 — the priority rule, owner: "Overlap should be the failure mode,
// not breaking the gameplay completely"). Rounds 1-2 bounded the canvas into
// the free band between the top-strip chrome and the pads; on a short
// LANDSCAPE viewport those axis-aligned reservations consumed the whole
// height and the fit collapsed (measured: 41x26px at 844x390, 0x0 at
// 640x360 — the field simply vanished). ROUND 4 reverses the priority:
// (1) the canvas is ALWAYS USABLE — never below its floor, never outside the
// viewport, any orientation (the only hard failure); (2) the chrome stays
// on-screen and tappable; (3) no overlap — pursued only when it costs
// nothing in 1 or 2. So the SCALE is the plain viewport-limited letterbox
// (chrome never shrinks the field), and only the PLACEMENT is chrome-aware:
// top-aligned below the visible top-strip chrome row when there is room,
// clamped INSIDE the viewport otherwise — accepting overlap, never collapse.
// Desktop / '.cog-only' keeps the flex-centred whole-viewport letterbox
// (WAVE-23: the dimmed pads, cogs and the default-on hints deliberately sit
// over the arena there; rounds 1-2 also shrank a desktop that had the text
// HUD opted in — the touchLive gate now covers all of it).
const BAND_MARGIN = 6;
// ROUND 4 floor: the field stays the dominant element on screen — canvas
// height >= 55% of the viewport height — except where the phone itself is
// the limit: on a viewport narrower than 1.6:1 (portrait) the width-limited
// height (vw/1.6) is already the largest field possible, so it is the floor.
// The viewport-limited fit always satisfies it, so the documented chrome
// shrink (pad buttons 64 -> 56/48) never needs to fire.
const CANVAS_FLOOR_FRACTION = 0.55;
function touchLayerLive() {
  // Only the REAL touch layer ('.on' — coarse pointers / touch devices, where
  // the pads are opaque thumb controls) gets chrome-aware placement.
  const touch = document.getElementById('touch');
  return !!(touch && touch.isConnected && touch.classList &&
    touch.classList.contains('on') && getComputedStyle(touch).display !== 'none');
}
// ROUND 2 union (kept): the bottom edge of the WHOLE visible top-strip chrome
// row — #hud plus every #touch button.cog (settings / "?" / radar / map) —
// measured LIVE. The selectors iterate whatever is displayed, so a future
// button added to the row is placed-below automatically, and no button name
// or pixel value is hardcoded. (The retired #hints panel used to ride this
// row; the help-mode strip is pointer-events:none and bottom-anchored, so it
// owns no layout here.)
function topChromeBottom() {
  let bottom = 0;
  const vh = viewSize().vh;
  const consider = (el) => {
    if (!el || !el.isConnected) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    // visToLayoutY: LAYOUT px — the UI-fit transform below scales the paint,
    // never the layout, so every band measurement inverts it (centre-origin
    // inverse; visual/scale was the WRONG inverse, see visToLayoutY).
    const b = visToLayoutY(r.bottom, vh);
    if (r.height > 0 && b > bottom) bottom = b;
  };
  consider(document.getElementById('hud'));
  const touch = document.getElementById('touch');
  for (const el of touch ? touch.querySelectorAll('button.cog') : []) consider(el);
  return bottom;
}
// FIT-TO-VIEWPORT UI SCALE (owner 2026-09-18, msg_01M2S72CF4902CWRWE7VJ3Y22M:
// "The whole interface should be able to shrink itself to fit a little better"
// — galaxy.click keeps a header on screen unless the game is fullscreen, so
// the box the game actually GETS is shorter than the screen). The viewport
// source below is the VISUAL viewport when the platform has one, never the
// screen: in a host iframe that is the iframe's visible box. A pinch-zoomed
// visual viewport is IGNORED (the user's zoom is honoured; auto-fit is a
// floor, not an override).
function viewSize() {
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) < 0.01 && vv.width >= 1 && vv.height >= 1)
    return { vw: vv.width, vh: vv.height };
  return { vw: window.innerWidth, vh: window.innerHeight };
}
// The one uniform scale the whole interface (canvas, pads, HUD, overlays —
// everything lives inside #wrap) is painted at. Layout positions stay
// UNSCALED (a transform does not change layout), so the round-5 band
// arithmetic runs in layout space and a uniform scale preserves its
// zero-overlap result; only the paint shrinks. getBoundingClientRect returns
// VISUAL (post-transform) rects, so every band measurement divides by
// uiScaleNow to get back to the layout space it positions in.
let uiScaleNow = 1;
let uiFitState = { scale: 1, wanted: 1, floored: false };
// VISUAL -> LAYOUT under the centre-origin UI-fit transform. getBoundingClientRect
// returns VISUAL (post-transform) coordinates; the inverse is
// layout = origin + (visual - origin)/scale — NOT visual/scale, which is only
// correct at a 0,0 origin. The wrong inverse bent every band away from the
// true pad positions wherever a scale was applied (measured at 480x270: the
// right band read ~60px instead of ~106px and the canvas slid under the pad).
// The transform origin is #wrap's centre; #wrap fills the viewport, so the
// origin is the viewport centre — a fixed point of the transform.
function visToLayoutX(x, vw) { return vw / 2 + (x - vw / 2) / uiScaleNow; }
function visToLayoutY(y, vh) { return vh / 2 + (y - vh / 2) / uiScaleNow; }
// fitCanvas's last round-5 verdict, so verifiers can tell an honest zero
// (band fit) from the NAMED FALLBACK (round-4 letterbox, overlap accepted).
let lastFitFellBack = false;
// Pure: the largest scale <= 1 that pulls layout-space bounds `b` fully
// inside the vw x vh viewport under a centre-origin uniform transform,
// clamped to the legibility floor. {wanted, floored} report the unclamped
// value and whether the floor had to stop it. Exposed via __TEST (uiFitScale)
// so the node suite can matrix-test the arithmetic without a layout engine.
function uiFitScale(vw, vh, b, floor) {
  const cx = vw / 2, cy = vh / 2;
  let s = 1;
  if (b.left < 0) s = Math.min(s, cx / (cx - b.left));
  if (b.top < 0) s = Math.min(s, cy / (cy - b.top));
  if (b.right > vw) s = Math.min(s, (vw - cx) / (b.right - cx));
  if (b.bottom > vh) s = Math.min(s, (vh - cy) / (b.bottom - cy));
  return { scale: Math.max(floor, s), wanted: s, floored: s < floor };
}
// ROUND 5 (owner 2026-09-18, msg_01M2S6XRT0 — seen on his own phone in
// fullscreen landscape: "it should do its best to keep the buttons off the
// canvas in landscape. There's plenty of screen room on my phone and it
// still overlaps"): ZERO overlap is now the bar on touch layouts. The
// canvas is fitted into the viewport MINUS live-measured CONTROL BANDS —
// SIDE bands in landscape (never the top+bottom stack that collapsed the
// field in round 2: a short landscape viewport keeps its whole height),
// a BOTTOM band in portrait, the top-strip chrome row always. The round-4
// priorities still rule the corners: below the R4 floor (canvas height <
// min(55% vh, vw/1.6)) the ROUND-4 letterbox stands and overlap is ACCEPTED
// — the named fallback, never a collapsed field. Desktop / '.cog-only'
// keeps the round-4 flex-centred layout verbatim (WAVE-23: the dimmed pads
// deliberately sit over the arena there; the touchLayerLive gate covers it).
function controlBands() {
  // Live-measured reserved bands, px from the viewport edges, plus the pad
  // geometry the steer-zone placement needs. Caller checked touchLayerLive().
  // All rects are LAYOUT px (divided out of the current UI-fit scale) because
  // the canvas this sizes is positioned in layout space, under the transform.
  const { vw, vh } = viewSize();
  const landscape = vw > vh;
  const bands = { left: 0, right: 0, top: topChromeBottom() + BAND_MARGIN, bottom: 0,
    padTop: vh, padInnerLeft: 0, padInnerRight: vw };
  const tops = [], sides = [];
  for (const el of document.querySelectorAll('#touch .pad')) {
    if (!el.isConnected) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const v = el.getBoundingClientRect();
    if (!v.width && !v.height) continue;
    // Centre-origin transform: positions invert as origin + (v-origin)/scale
    // (plain division is only right at origin 0,0 — the 480x270 probe caught
    // the right band reading ~60px instead of ~106px off that assumption).
    const r = { left: visToLayoutX(v.left, vw), right: visToLayoutX(v.right, vw), top: visToLayoutY(v.top, vh) };
    tops.push(r.top);
    sides.push(r);
  }
  for (const r of sides) {
    if (r.left < vw / 2) {
      bands.padInnerLeft = Math.max(bands.padInnerLeft, r.right);
      if (landscape) bands.left = Math.max(bands.left, r.right + BAND_MARGIN);
    } else {
      bands.padInnerRight = Math.min(bands.padInnerRight, r.left);
      if (landscape) bands.right = Math.max(bands.right, vw - r.left + BAND_MARGIN);
    }
  }
  if (tops.length && !landscape) {
    bands.padTop = Math.min(...tops);
    bands.bottom = Math.max(bands.bottom, vh - bands.padTop + BAND_MARGIN);
  }
  return bands;
}
// Pure fit: the canvas box inside the avail rect (bands already subtracted),
// or {fallback} below the R4 floor. Exposed via __TEST (bandFit) so the node
// suite can matrix-test the zero-overlap arithmetic without a layout engine.
function bandFit(vw, vh, b) {
  const aw = Math.max(0, vw - b.left - b.right);
  const ah = Math.max(0, vh - b.top - b.bottom);
  const scale = Math.min(aw / C.VIEW_W, ah / C.VIEW_H);
  const w = Math.floor(C.VIEW_W * scale), h = Math.floor(C.VIEW_H * scale);
  const floor = Math.min(CANVAS_FLOOR_FRACTION * vh, vw / 1.6);
  // 1px slack: a width-limited fit lands at floor(vw/1.6) — the floor itself
  // minus rounding, never a real shortfall (390x844: 243 vs 243.75).
  if (floor - h > 1) return { fallback: true, h, floor };
  return { fallback: false, w, h, scale,
    left: b.left + (aw - w) / 2, top: b.top + (ah - h) / 2 };
}
// The floating stick's HOME band (the addendum: "it should not be confined
// to the canvas alone"): the LEFT band in landscape, the bottom-centre strip
// between the pads (the fixed joystick's old slot) in portrait. Hidden when
// the bands are not placed (no layout engine) or the fit fell back (keep the
// whole canvas armable there).
function placeSteerZone(bands) {
  const zone = document.getElementById('steer-zone');
  if (!zone || !zone.style) return;
  if (!bands || bands.fallback) { zone.style.display = 'none'; return; }
  const { vw, vh } = viewSize();
  if (vw > vh) {
    zone.style.left = '0px';
    zone.style.top = Math.round(bands.top) + 'px';
    zone.style.width = Math.round(bands.left) + 'px';
    zone.style.height = Math.round(vh - bands.top) + 'px';
  } else {
    const left = bands.padInnerLeft, right = bands.padInnerRight;
    if (right - left < 40) { zone.style.display = 'none'; return; }
    zone.style.left = Math.round(left) + 'px';
    zone.style.top = Math.round(bands.padTop) + 'px';
    zone.style.width = Math.round(right - left) + 'px';
    zone.style.height = Math.round(vh - bands.padTop) + 'px';
  }
  zone.style.display = 'block';
}
// The fixed-px chrome whose LAYOUT bounds the UI-fit scale must keep on
// screen: the thumb pads, the cog row, the text HUD and the stick's home
// band. (The transient #joy/#fjoy are drag visuals placed at the touch point
// — never layout actors.) Returns layout-space rects.
function chromeLayoutRects() {
  const out = [];
  const consider = (el) => {
    if (!el || !el.isConnected) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const v = el.getBoundingClientRect();
    if (!v.width && !v.height) return;
    out.push({ left: visToLayoutX(v.left, VW), top: visToLayoutY(v.top, VH),
      right: visToLayoutX(v.right, VW), bottom: visToLayoutY(v.bottom, VH) });
  };
  const { vw: VW, vh: VH } = viewSize();
  const touch = document.getElementById('touch');
  if (touch && touch.isConnected && getComputedStyle(touch).display !== 'none') {
    for (const el of touch.querySelectorAll('.pad')) consider(el);
    // LADDER (2026-09-18): while the top strip is TRANSIENT it is not a layout
    // actor — an overlay may intersect the canvas by the ladder rule, and
    // keeping it out of the UI-fit bounds stops the scale churning with the
    // reveal window (shown/hidden must not re-shrink the interface).
    if (!topTransient) for (const el of touch.querySelectorAll('button.cog')) consider(el);
    consider(document.getElementById('steer-zone'));
  }
  if (!topTransient) consider(document.getElementById('hud'));
  return out;
}
// UI-TIGHT (owner 2026-09-18, hosted-short-landscape follow-on to
// msg_01M2S72CF4902CWRWE7VJ3Y22M): the bottom-anchored pad stack (296px)
// and the top-right cog row (~56px) COLLIDE once a host header eats ~60px —
// buttons stacked on buttons, the owner's "everything is a little cut off".
// A uniform scale cannot fix this (it preserves relative geometry), so the
// LAYOUT degrades instead, exactly as the task mandates: while the box is
// tight the cog row moves to the top CENTRE — horizontally clear of the side
// pads at every acceptance width, still inside the live-measured top band
// the canvas fit already reserves (round-5 zero-overlap untouched), and
// clamped right of the live HUD block so chrome never stacks on chrome.
// Inline placement (this file's house style for canvas/steer-zone): left is
// set and right cleared, so relaxing clears both and the CSS right-anchored
// row returns on the next fit.
let cogTight = false;
function placeCogRow(tight, vw) {
  const touch = document.getElementById('touch');
  if (!touch || !touch.querySelectorAll) return;
  const cogs = [...touch.querySelectorAll('button.cog')];
  if (!tight) {
    if (cogTight) for (const el of cogs) { el.style.left = ''; el.style.right = ''; }
    cogTight = false;
    return;
  }
  cogTight = true;
  // Visual left-to-right order is MAP, RADAR, HELP, SETTINGS — the reverse
  // of the DOM's right-anchored order.
  const ordered = [...cogs].reverse();
  const GAP = 6;
  const rects = ordered.map((el) => {
    const v = el.getBoundingClientRect();
    return { el, w: v.width / uiScaleNow };
  });
  const rowW = rects.reduce((s, r) => s + r.w, 0) + GAP * (rects.length - 1);
  let start = (vw - rowW) / 2;
  const hud = document.getElementById('hud');
  if (hud && hud.isConnected) {
    const hr = hud.getBoundingClientRect();
    if (hr.width > 0) start = Math.max(start, visToLayoutX(hr.right, vw) + 8);
  }
  let x = Math.min(start, vw - 10 - rowW);
  for (const r of rects) {
    r.el.style.left = Math.round(x) + 'px';
    r.el.style.right = 'auto';
    x += r.w + GAP;
  }
}
// CANVAS LADDER — SACRIFICE 1: TOP-CHROME TRANSIENCE (owner 2026-09-17,
// msgs 78PTR + 7BRBS + the 9MV7F measurement ruling: "TRANSIENCE MUST PAY
// FOR ITSELF, decided by MEASURING whether the canvas rect actually grows...
// No orientation checks, no hardcoded device list"). Where the persistent
// top strip (cog row + text HUD) is the bottleneck, it goes TRANSIENT on the
// SAME show-on-interaction window as the fullscreen button (fsOverlay — one
// system); where it is not, it persists. The pure decision below is exposed
// via __TEST (ladderDecide) so the node suite can matrix-test the threshold
// and the hysteresis deadband without a layout engine.
let topTransient = false;      // current engaged state (hysteresis carries it)
let ladderMeasure = null;      // last {persistentH, transientH, gain} for __TEST
let ladderOverride = null;     // __TEST only: 'off' pins the persistent ladder
// Pure: engage when the measured canvas-height gain >= GAIN_ENGAGE*vh; relax
// only when it falls below GAIN_RELEASE*vh (the deadband — a gain hovering at
// the threshold cannot flicker the row between persistent and transient).
function ladderDecide(gainH, vh, engaged, cfg) {
  const bar = engaged ? cfg.GAIN_RELEASE : cfg.GAIN_ENGAGE;
  return gainH >= bar * vh;
}
// CANVAS LADDER — SACRIFICE 2: COMPACT PADS. state carries the hysteresis
// (compact holds while the ordinary fit is in fallback, relaxes the moment
// the ordinary fit holds — measured each fit, never assumed).
let padsCompact = false;
function setBodyClass(name, on) {
  const body = typeof document !== 'undefined' && document.body;
  if (body && body.classList) body.classList.toggle(name, !!on);
}
function fitCanvas() {
  if (!window.innerWidth || !canvas.style) return; // stub/headless guard
  lastFitFellBack = false;
  // The viewport the game actually GOT (visualViewport-first, see viewSize).
  const { vw, vh } = viewSize();
  // ROUND 4 base: the scale is the VIEWPORT-limited letterbox only — chrome
  // NEVER shrinks the field (that is how round 2 collapsed landscape to
  // 41x26 / 0x0). ROUND 5 narrows it ON TOUCH LAYOUTS ONLY, below.
  const fit = Math.min(vw / C.VIEW_W, vh / C.VIEW_H);
  let scale = displayScale(fit);
  // A forced resolution mode (PIXEL-PERFECT / 2 / 3 / 4) can round the scale
  // ABOVE the viewport-limited fit on a phone (floor(0.81) -> max(1, 0) = 1
  // -> a 480px field on a 390px screen). Priority 1: never outside the
  // viewport — clamp back to the fit.
  if (scale > fit) scale = fit;
  let w = Math.floor(C.VIEW_W * scale), h = Math.floor(C.VIEW_H * scale);
  let placed = false, bands = null, fellBack = false;
  // The interface union bounds in LAYOUT space — the seed is the viewport
  // itself (the round-4 letterbox is viewport-limited, so the canvas never
  // starts outside it); the chrome below can only push it further out.
  let bounds = { left: 0, top: 0, right: vw, bottom: vh };
  // No real layout API (node harness stub DOM) -> no live chrome to place
  // against: the whole-viewport letterbox stands exactly as before.
  if (typeof getComputedStyle === 'function' && touchLayerLive()) {
    placed = true;
    // LADDER STEP 1 — measure transience BEFORE placing anything: the top
    // band's height is placement-independent (the cog row is 46px tall
    // wherever it sits horizontally), so both fits can be priced from the
    // persistent bands. Gain is ZERO wherever the persistent fit has already
    // fallen back — there the canvas is the round-4 viewport-limited letterbox
    // and reclaiming the strip cannot grow it, so the buttons persist.
    bands = controlBands();
    const fitP = bandFit(vw, vh, bands);
    const fitT = bandFit(vw, vh, { ...bands, top: 0 });
    const gain = fitP.fallback ? 0 : fitT.h - fitP.h;
    ladderMeasure = { persistentH: fitP.h, transientH: fitT.h, gain };
    topTransient = ladderOverride === 'off' ? false
      : ladderDecide(gain, vh, topTransient, C.TOP_CHROME);
    setBodyClass('top-transient', topTransient);
    if (topTransient) bands = { ...bands, top: 0 };
    let bf = bandFit(vw, vh, bands);
    // LADDER STEP 2 — compact pads, ONLY where they pay: engaged when the
    // ordinary fit has fallen back, kept only when the compact fit HOLDS (the
    // narrower pads buy the canvas enough width/height to leave fallback); if
    // compact cannot rescue the fit either it reverts (a sacrifice that buys
    // nothing is UX lost for nothing). Relaxes the moment the ordinary fit
    // holds again — re-measured on every fit, never assumed.
    if (ladderOverride === 'off') {
      if (padsCompact) { padsCompact = false; setBodyClass('pads-compact', false); }
    } else if (bf.fallback) {
      if (!padsCompact) { padsCompact = true; setBodyClass('pads-compact', true); }
      const bandsC = controlBands();
      const bandsC2 = topTransient ? { ...bandsC, top: 0 } : bandsC;
      const bfC = bandFit(vw, vh, bandsC2);
      if (!bfC.fallback) { bands = bandsC2; bf = bfC; }
      else { padsCompact = false; setBodyClass('pads-compact', false); }
    } else if (padsCompact) {
      padsCompact = false; setBodyClass('pads-compact', false);
    }
    // UI-TIGHT placement runs AFTER the ladder steps (compact changes the pad
    // stack's height, transient makes the collision moot): the pads' highest
    // top vs the cog row's bottom — less than a 4px guard between them and the
    // two stacks collide. The band math above is placement-independent (the
    // row's vertical extent is the same wherever it sits), so measuring the
    // degraded layout here loses nothing.
    let padTopMin = Infinity;
    for (const el of document.querySelectorAll('#touch .pad')) {
      if (!el.isConnected) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      padTopMin = Math.min(padTopMin, visToLayoutY(el.getBoundingClientRect().top, vh));
    }
    // ui-tight runs under transience too (2026-09-18, hdr90 arm): a hosted
    // 300px-tall box puts the pads at the viewport top where the cog row
    // (revealed) would stack on the pad BUTTONS — transient chrome may overlap
    // the CANVAS, never other chrome.
    placeCogRow(padTopMin < topChromeBottom() + 4, vw);
    if (!bf.fallback) {
      // ROUND 5: fitted into the bands, centred in what remains — overlap
      // with the reserved chrome is impossible by construction.
      w = bf.w; h = bf.h;
      canvas.style.position = 'absolute';
      canvas.style.top = Math.round(bf.top) + 'px';
      canvas.style.left = Math.round(bf.left) + 'px';
      bounds = { left: bf.left, top: bf.top, right: bf.left + w, bottom: bf.top + h };
    } else {
      // The NAMED FALLBACK (a viewport too small for zero overlap): the
      // round-4 letterbox — top-aligned below the chrome row, clamped INSIDE
      // the viewport, overlap accepted, never a collapsed canvas.
      fellBack = true;
      lastFitFellBack = true;
      const top = Math.min(bands.top, vh - h);
      const left = (vw - w) / 2;
      canvas.style.position = 'absolute';
      canvas.style.top = Math.round(top) + 'px';
      canvas.style.left = Math.round(left) + 'px';
      bounds = { left, top, right: left + w, bottom: top + h };
    }
    for (const r of chromeLayoutRects()) {
      bounds.left = Math.min(bounds.left, r.left);
      bounds.top = Math.min(bounds.top, r.top);
      bounds.right = Math.max(bounds.right, r.right);
      bounds.bottom = Math.max(bounds.bottom, r.bottom);
    }
  }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  if (!placed) {
    canvas.style.position = '';
    canvas.style.top = '';
    canvas.style.left = '';
  }
  // FIT-TO-VIEWPORT UI SCALE (hosted/small boxes): when the fixed-px chrome
  // would clip (a header ate the height, a host narrowed the box), the WHOLE
  // interface shrinks as ONE unit — uniform transform on #wrap, layout
  // untouched, so the band fit above and its zero-overlap result are exactly
  // preserved. Never below the legibility floor; a floored scale that still
  // clips is the STATED degradation (reported by the verifier, not hidden).
  // Fullscreen/immersive gets the full viewport back, so the scale relaxes
  // to 1 on the same live measurement — no special case.
  const wrap = document.getElementById('wrap');
  if (C.UI_FIT.FIT_SCALE && wrap && wrap.style) {
    const st = uiFitScale(vw, vh, bounds, C.UI_FIT.SCALE_FLOOR);
    uiFitState = st;
    uiScaleNow = st.scale;
    if (st.scale < 0.999) {
      wrap.style.transformOrigin = '50% 50%';
      wrap.style.transform = 'scale(' + st.scale + ')';
    } else {
      wrap.style.transformOrigin = '';
      wrap.style.transform = '';
    }
  } else {
    uiScaleNow = 1;
    uiFitState = { scale: 1, wanted: 1, floored: false };
  }
  placeSteerZone(placed && !fellBack ? bands : null);
  renderer.resize();   // re-size the backing store to the new CSS size
}
fitCanvas();
// SHOP PAGING rides the SAME viewport listeners (one handler per event name —
// the node harness routes a single handler per type): a viewport change
// (rotate, desktop window resize, the mobile toolbar collapse) re-chunks the
// pages — the wanted page is kept, clamped to the new page count. The null
// pager guards every non-shop screen.
function onViewportResize() {
  fitCanvas();
  if (shopPager) finalizeShopPager();
}
window.addEventListener('resize', onViewportResize);
window.addEventListener('orientationchange', onViewportResize);
// The hosted/iframed dynamic viewport (and the collapsing mobile toolbar in
// immersive mode) resize WITHOUT a window resize event — visualViewport's own
// resize is the production signal (the 100vh trap, measured).
if (window.visualViewport && window.visualViewport.addEventListener)
  window.visualViewport.addEventListener('resize', onViewportResize);

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
  killRateEwma: 0,   // G33: rolling kills/second (loot.js ewmaKillRate; feeds the adaptive potion curve)
  killsAtRateTick: 0,// G33: p.kills at the last estimator tick (the per-frame delta)
  healBudget: 0,      // G36: SHARED sustained-heal budget (HP units; heal.js helpers — lifesteal + harvest)
  portal: null,      // open portal after a boss clear ({ x, y, age }) — wave-6
  effects: [],       // transient skill/weapon visuals ({ kind, x, y, age, ttl })
  toasts: [],        // transient HUD messages ({ msg, ttl, tint }) — WAVE-14: also the event feed
  bossBanner: null,  // WAVE-14: boss-arrival overlay
                     // ({ names, verb, title, sub, ttl } | null) — names/verb
                     // drive the two-line fit, title stays the flat legacy form
  // FIRST-RUN PROLOGUE (owner 2026-09-18): while `prologue` is non-null the
  // run is INERT — no enemy spawns, the run clock frozen, a tinted potion on
  // screen ({ t, drunk, potion: { x, y }, bannerIdx }). `prologueRan` marks
  // the whole run that OPENED with a prologue (the coach-absorb marker);
  // `prologueShieldT` is the rainbow ring's own lifetime, parallel to
  // p.invuln so a later portal refresh can never restart the pulse.
  prologue: null,
  prologueRan: false,
  prologueShieldT: 0,
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
  // G15: 'death-cine' is the death movie — a frozen beat between die() and
  // the 'dead' payoff screen.
  mode: 'menu',      // 'menu' | 'title' | 'farewell' | 'intro' | 'playing' | 'draft' | 'evolve' | 'intermission' | 'death-cine' | 'dead'
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
  // M1 THE PER-RUN ATLAS (atlas.js): the ONE visited grid + landmark set
  // (C2 — the map screen and the A2 radar both read THIS datum). Created
  // fresh in startRun next to groundSeed; never serialised (C4: no save
  // schema change); consumes ZERO rng draws (R2).
  atlas: null,
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
  shrine: null,      // VIEW on state.shrines: the first unused altar (the
                     // render + tour handoff; the set itself is static — S1)
  shrines: [],       // S1: world-seeded set of 4, chosen ONCE at run start
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
  // M1 THE MAP SCREEN: canvas-drawn, OPAQUE over the field, and the sim KEEPS
  // RUNNING while it is open (C1 — a pausing map is a free dodge button).
  // CLOSED by default at boot and on every startRun (C6: nothing else opens
  // it). Toggled by the M key / the MAP touch button (toggleMap). Not
  // persisted, not sticky across runs.
  mapOpen: false,
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
  // NIGHT MODE (owner-authorized 2026-09-17): `night` is the SESSION toggle
  // (title SETUP only, OFF by default, never persisted — a reload ends the
  // night); `nightRun` is the run-scoped stamp (the apexRun pattern) frozen
  // at startRun, so a toggle between runs can never rewrite a live run's
  // payout class; `nightSummary` is the return-to-game line the title shows.
  night: false,
  nightRun: false,
  nightSummary: null,
  runSettled: null,  // S1: the run's ONE settlement (numbers, once paid) — run-once guard
  mawDeadline: 0,    // sim time the maw encounter's window closes
  // ---- IN-RUN REFERENCE ACCESS: the reference's return door + the end
  // screen's composed payload (reshowEndScreen recomposes from it WITHOUT
  // re-settling gold). Both are screen-scoped, cleared at the run boundary.
  helpFrom: null,    // 'gate' | 'run' | 'end' | 'title' — where GOT IT goes
  manualPage: null,  // MANUAL v2: the open page (1..4) while the manual is up
  endScreen: null,   // { titleText, titleCls, subHtml } of the last end card
  helpMode: false,   // HELP MODE: the "?" inspect mode is armed
  helpOrigin: null,  // the mode it was armed on (leaving returns there)
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
  // ---- G25 slice 2: THE APEX GALLERY (presentation only; never persisted) ----
  // Same ring contract as the trophy gallery: apexIdx is the position into the
  // APEX_UPGRADES catalogue (wrapped by refreshApexView). There is no
  // apexView — the screen REUSES the one grid-showcase contract, state.trophyView
  // (see showApexGallery), so renderer.drawTrophyShowcase paints it and the
  // trophyShowcase seam measures it. No second screen idiom.
  apexIdx: 0,
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

// ---------- v9 WHAT'S NEW (owner 2026-09-17) -------------------------------
// "Have we timestamped last played for our auto saves yet? ... so we can
// inform older players of significant updates like this. We can give them a
// fancy paper looking popup explaining new features."
// The CURRENT RELEASE carries its id + ship date AS CONSTANTS IN CODE (no
// lookup, no build step): bump WHATS_NEW.id/dateMs/copy when a release worth
// telling ships, or set worthTelling false and nothing pops. Gating rule
// (whatsNewDueFor): the note pops at launch, on the title, for a player whose
// save EXISTS, who has not dismissed THIS release (lastSeenUpdate), and whose
// lastPlayed predates the release (a MISSING timestamp — an older, pre-v9
// save — counts as "has not seen it", so existing players get it exactly
// once). PRECEDENCE with the first-run PROLOGUE, stated so the two intros can
// never fight: a BRAND-NEW profile (no save at all) gets the prologue and NOT
// this note; a RETURNING profile gets this note and no prologue (their
// totals.runs is past 0, which is what arms the prologue).
//
// ADDENDUM (owner 2026-09-17): ONE TREATMENT, TWO AUDIENCES — "We could even
// let older players have a one off run just like new players would have." A
// returning player on a MARKED release gets the note AND the same one-off
// GUIDED RUN a new player gets (potion, banners, assisted start — the whole
// state.prologue machinery, nothing veteran-specific). NO new field: it keys
// off lastSeenUpdate. The DISMISS writes lastSeenUpdate = id immediately (the
// save IS the proof the player saw it); startRun then arms the guided run
// while lastSeenUpdate === id (or the note is still due — a player who taps
// START GAME without dismissing is converting too), and the ARM consumes the
// one-off by clearing lastSeenUpdate and persisting: the run that opened with
// the tutorial is the offer, never repeated. Population rules, plainly:
//   no lastPlayed + other save data -> older player -> note + one-off run;
//   no lastPlayed + no save at all  -> fresh profile -> prologue, no note;
//   lastPlayed present              -> normal rules (lastSeenUpdate decides).
const WHATS_NEW = {
  id: '2026-09-18',                    // RELEASE_ID — one per marked release
  dateMs: Date.UTC(2026, 8, 18),       // the ship date (2026-09-18)
  worthTelling: true,                  // the gate: only MARKED releases pop
  title: "WHAT'S NEW",
  lines: [
    'Your next run opens with the same short tutorial a new player gets.',
    'Walk to the potion and drink it - skipping the explaining keeps the shield.',
    'Controls appear one at a time, each with a tip, as you need them.',
    'Level-up picks land with a card ceremony while play continues.',
    'The shop now pages with arrows and fits three cards across.',
  ],
};
// Pure: is the note due for THIS profile/release/boot state? Exported via
// __TEST so the gate is matrix-testable without a DOM.
function whatsNewDueFor(prof, rel, freshBoot) {
  if (!rel || !rel.worthTelling) return false;   // unmarked release: nothing, ever
  if (freshBoot) return false;                   // brand-new profile: prologue owns the intro
  if (prof && prof.lastSeenUpdate === rel.id) return false;   // already dismissed
  const last = prof && typeof prof.lastPlayed === 'number' ? prof.lastPlayed : null;
  return last === null || last < rel.dateMs;     // missing stamp = has not seen it
}
// ADDENDUM (owner 2026-09-17): is the ONE-OFF GUIDED RUN due for this player?
// Pure, and keyed off lastSeenUpdate only (NO new field). True when the player
// has DISMISSED this release's note (lastSeenUpdate === id) but not yet taken
// the offered run — the arm at startRun consumes it — or when the note is due
// RIGHT NOW (they tapped START GAME without dismissing; converting all the
// same). A brand-new profile never qualifies: the prologue is theirs already.
function veteranIntroDueFor(prof, rel, freshBoot) {
  if (!rel || !rel.worthTelling) return false;   // unmarked release: no run either
  if (freshBoot) return false;                   // brand-new profile: prologue owns it
  if (prof && prof.lastSeenUpdate === rel.id) return true;    // dismissed, run not yet taken
  return whatsNewDueFor(prof, rel, false);       // note due this very launch
}
let whatsNewTried = false;   // the note is a LAUNCH artifact: first title entry only

// ---------- W1 AUTOSAVE before any exit path ----------
// Tab close, navigation and backgrounding all flush the profile. Writes are
// synchronous, so they survive beforeunload/pagehide. The explicit Exit Game
// flow is W4's work; this is the guarantee it can build on, and it means a
// player can never lose progress by closing the page.
// v9 WHAT'S NEW (owner 2026-09-17): every persisted save stamps lastPlayed —
// the launch gate reads it to find returning players who were away before a
// marked release shipped. ONE choke point, so no save path can forget it.
function persistProfile() {
  profile.lastPlayed = Date.now();
  return saveProfile(profile);
}
export function autosave(reason = 'exit') {
  return persistProfile();
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

// Last pilot choice per browser (hudText settings pattern). G31 (owner
// 2026-09-16, verbatim: "The players want the selections they made for auto
// and manual to persist between runs."): the pref is now READ back — at boot
// and at run start — replacing the OLD build directive ("EVERY run starts in
// AUTO regardless") that the owner has reversed. Absent / unreadable /
// unrecognised -> AUTO_ALL (the fresh-player default); the legacy persisted
// name 'AUTO' maps to AUTO_ALL via normalizePilotMode.
const KEY_PILOT = 'hordes_pilot';
function savePilotPref(mode) {
  try { prefStorage.setItem(KEY_PILOT, mode); } catch { /* shim */ }
}
function loadPilotPref() {
  try { return normalizePilotMode(prefStorage.getItem(KEY_PILOT)); }
  catch { return 'AUTO_ALL'; }
}
// G31: the doctrine STANCE persists on the same prefStorage seam. The pilot
// mode is a screen-level preference; the stance rides the same contract
// (write on cycle, read at boot + run start, validate, BALANCED fallback).
// state.focus is deliberately NOT persisted — it is tactical, moment-to-
// moment targeting, not a preference.
const KEY_STANCE = 'hordes_stance';
function saveStancePref(s) {
  try { prefStorage.setItem(KEY_STANCE, s); } catch { /* shim */ }
}
function loadStancePref() {
  try {
    const v = prefStorage.getItem(KEY_STANCE);
    return v && C.AUTOPILOT.STANCES[v] ? v : 'BALANCED';
  } catch { return 'BALANCED'; }
}
// Apply the persisted stance to BOTH controllers (swapPilotMode carries
// stance across a swap, so both must agree). Direct assignment is the
// established pattern — easeToBossStance does the same.
function applyStancePref() {
  const s = loadStancePref();
  autoController.stance = s;
  manualController.stance = s;
  return s;
}
// AUTO-PICK PREFERENCE — RETIRED (owner 2026-09-16, verbatim): "I didn't want
// the card choice to be instant because I wanted to slow progress for someone
// playing too idle so they dont miss the whole game and then complain they are
// too powerful when they didn't witness the growth." An earlier brief asked
// for an INSTANT/6S/MANUAL settings row riding a 'hordes_autopick' key; that
// brief was CANCELLED and the preference surface is removed whole — the draft
// delay is a PACING MECHANIC, not an inconvenience. The shipped behaviour is
// the pre-brief one: a FIXED C.AUTOPILOT.DRAFT_TIMEOUT countdown for AUTO
// players, suspended (not reset) in MANUAL, and MANUAL pilots never
// auto-pick. Nothing may read or write 'hordes_autopick' in any form
// (setting, debug toggle, hidden key). test/test_autopick_pref.mjs pins this.

// Drop every held input (keys + stick). Used on AUTO toggle, run start, blur.
// Also snaps the knob visual back to center. FLOATING JOYSTICK (2026-09-18):
// a hard release of the floating drag too — no id filter (this is the
// "everything stands down" path: blur, mode swap, run start).
function clearPilotInput() {
  pilotInput.up = pilotInput.down = pilotInput.left = pilotInput.right = false;
  pilotInput.x = 0; pilotInput.y = 0; pilotInput.mag = 0;
  if (joyKnobEl && joyKnobEl.style) joyKnobEl.style.transform = 'translate(0px,0px)';
  if (fjoyApi) fjoyApi.release();
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
  // (WAVE-23's mode-dependent hints re-render retired with the panel — the
  // compact list lives in the reference's KEYBOARD page now, built live at
  // open time from HINT_LINES, so a pilot swap can never teach a stale mode.)
  toast(mode === 'MANUAL' ? 'MANUAL PILOT — WASD / arrows or the joystick'
    : mode === 'AUTO_MOVE' ? 'AUTO MOVE — pilot drives, skills + potions are yours'
    : 'AUTOPILOT ENGAGED — move, skills and potions');
}
function pilotPrefLabel() {
  return { AUTO_ALL: 'AUTO ALL', AUTO_MOVE: 'AUTO MOVE', MANUAL: 'MANUAL' }[normalizePilotMode(state.pilotMode)] || 'AUTO ALL';
}
function togglePilotMode() {
  // Cycle the ladder: AUTO ALL -> AUTO MOVE -> MANUAL -> AUTO ALL.
  controlUsed('pilot');   // PER-CONTROL INTRODUCTIONS: the user cycled it
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
  // PROLOGUE STAGED INTRODUCTION — the movement override, AFTER the
  // controller's own decide: (a) a banner up owns the pilot (the pause), so
  // movement is zeroed whatever the controller said; (b) once MOVE is
  // revealed, the player's held drag/keys steer the phase in ANY pilot mode
  // (the choreography's walk yields for as long as the input is held — the
  // lesson IS the walk); (c) a pilot who TOGGLED to MANUAL and then went
  // idle still gets the phase's fallback walk to the potion, so practising
  // the PILOT toggle can never strand the choreography (the bound rescues,
  // but the run should not need it). AUTO already walks (controllers.js).
  if (state.prologue && !state.prologue.drunk) {
    if (prologueBanner()) {
      decision.moveX = 0; decision.moveY = 0;
    } else {
      const m = prologueManualVec();
      if (m) {
        decision.moveX = m.x; decision.moveY = m.y;
      } else if (state.pilotMode === 'MANUAL') {
        const dx = state.prologue.potion.x - p.x;
        const dy = state.prologue.potion.y - p.y;
        const len = Math.hypot(dx, dy);
        if (len > 1) { decision.moveX = dx / len; decision.moveY = dy / len; }
      }
    }
  }
  // Movement. Loot speedMult (Windwalker boots) + SWIFT/BERSERK arch mods
  // multiply the base speed (controller decides WHERE, stats say HOW FAST).
  // N1 slice 3 AFTERIMAGE: her ult's speed window rides the SAME stat-
  // multiplier shape (no dash, no teleport — movement stays the controller's).
  const spd = p.stats.speed * (p.stats.speedMult || 1) * am.speedMult *
    (p.buffs.afterimage > 0 ? C.SKILLS.AFTERIMAGE.SPEED_MULT : 1);
  if (decision.moveX !== 0 || decision.moveY !== 0) {
    // ARENA RELIEF — the grade term (uphill slower / downhill faster), read
    // HERE for the pilot and at the enemy move seam through the SAME pure
    // function off the SAME field: the anti-sanctuary symmetry. High ground
    // slows whoever climbs it, pilot or horde, by the same rule.
    const grade = reliefGrade(p.x, p.y, decision.moveX, decision.moveY,
      state.groundSeed || 0, stageRelief(state.stage));
    // BLOCKING ELEVATION (msg_01M2RK5B): the cliff rule + tangent slide, the
    // SAME reliefStep the enemy move seam reads — one geometry function, both
    // sides, no wall-hacks for either (pinned in test_blocking_elevation.mjs).
    const stepped = reliefStep(p.x, p.y,
      p.x + decision.moveX * spd * grade * dt,
      p.y + decision.moveY * spd * grade * dt,
      state.groundSeed || 0, stageRelief(state.stage));
    p.x = stepped[0]; p.y = stepped[1];
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
  // E2 (R3/R9): from the horde wave on, the SAME weighted walk reads heavy
  // weights through ONE config dial (heavies spawn rarer than chaff) and the
  // SHRIKE joins the pool at its own weight. stages.js is outside this
  // slice's file scope, so the seam rides here; below E2.WAVE the entries
  // are untouched (byte-identical draws).
  if (state.wave.num >= C.E2.WAVE) {
    for (const e of entries) {
      if (ENEMY_TYPES[e[0]] && ENEMY_TYPES[e[0]].heavy) e[1] *= C.E2.HEAVY_WEIGHT_MULT;
    }
    entries.push(['SHRIKE', C.E2.SHRIKE_WEIGHT]);
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

// E2 (R1/R2): the HEAVY stamp. From the horde wave on, a heavy-tier body
// (ENEMY_TYPES[id].heavy) carries MID-BOSS-equivalent hp — config.js's ONE
// midBossHp definition read at waveNum-1 (R2: never a copied formula), with
// the same heat factor the herald takes. R8: the corpse pays HEAVY_XP_KILLS
// base kills of xp so the horde wave's drafts don't collapse when chaff xp
// drops. R7: the purse follows the BODY — the stamp upgrades the tier to
// HEAVY (a wave-1 TICK still pays CHAFF; only a real heavy body pays heavy).
function stampHeavy(e) {
  const wTick = Math.floor(state.time / 30);
  e.hp = e.maxHp = midBossHp(Math.max(1, state.wave.num - 1), wTick) *
    heatMultipliers(heatOf(state)).hp;
  e.xp = C.ENEMY.BASE_XP * ladderXp(wTick) * C.E2.HEAVY_XP_KILLS;
  e.purseTier = 'HEAVY';
}

// E2 (R9): THE FLYING TRAIT's ground-AoE exemption. rewrites.js/skills.js are
// outside this slice's file scope, so the exemption wraps the ONE main.js
// call site of each ground-AoE path (novas, blasts, chain detonations, the
// colossus shockwave, harvest blasts, ult fields/ticks): snapshot every live
// flyer's (hp, flash, slow), run the effect, restore — a flyer takes NOTHING
// from ground AoE and frost slow never grips it. DIRECT hits (projectiles,
// contact, and the Witch's chain beam — mode 'beam' restores only the slow,
// the beam's damage is meant to land) are untouched.
function flyingGuard(mode, fn) {
  let fly = null;
  for (const e of state.enemies) {
    if (e.flying && e.hp > 0) (fly = fly || []).push([e, e.hp, e.flash, e.slow]);
  }
  if (!fly) return fn();
  const out = fn();
  for (const [e, hp, flash, slow] of fly) {
    if (mode === 'blast') { e.hp = hp; e.flash = flash; }
    e.slow = slow;
  }
  return out;
}

function spawnWave(dt) {
  if (state.portal) return;   // breather while the portal is open (no spawns)
  if (state.prologue) return; // FIRST-RUN PROLOGUE: the world is inert until
                              // the potion is drunk (or the phase bound)
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
  // ARENA RELIEF — EXPOSURE BIAS (the risk half of high ground): a pilot
  // standing high draws the horde's azimuth partway toward the uphill side,
  // so the pressure takes the ridge with them instead of paying the climb
  // alone. A pure transform of the angle each spawn just drew — count,
  // cadence and ring distance are untouched, and the rng stream cannot shift.
  const relCfgS = stageRelief(state.stage);
  const relSeedS = state.groundSeed || 0;
  const pilotLevel = reliefLevel(state.player.x, state.player.y, relSeedS, relCfgS);
  const uphillAz = pilotLevel >= C.RELIEF.HIGH_LEVEL
    ? reliefUphillAzimuth(state.player.x, state.player.y, relSeedS, relCfgS)
    : 0;
  for (let i = 0; i < groups; i++) {
    let a = Math.random() * Math.PI * 2;
    if (pilotLevel >= C.RELIEF.HIGH_LEVEL) a = reliefBiasAngle(a, pilotLevel, uphillAz);
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
      (hz && hz.kind === 'packBurst' ? hz.burst : 1) *
      // E2 (R5): ONE knob triples the chaff pop from the horde wave on —
      // the horde is CHASER/SWARMER bodies, the heavy tier stays rare.
      (ENEMY_TYPES[typeId].chaff && state.wave.num >= C.E2.WAVE
        ? C.E2.CHAFF_DENSITY_MULT : 1)));
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
      // E2 (R1/R2): heavies carry the mid-boss body from the horde wave on —
      // AFTER escalate (the ladder re-base) so the stamp is the final word on
      // the base body, BEFORE elite mods / rarity tiers compose on top and
      // BEFORE stampStageStats records preStageMaxHp (chest eligibility reads
      // the heavy body — drops come mostly from the strong enemies).
      if (ENEMY_TYPES[typeId].heavy && state.wave.num >= C.E2.WAVE) stampHeavy(e);
      // E2 (R6): plain-chaff xp drops to near-zero from the horde wave on
      // (an elite is an EVENT, never chaff) — the wave's xp income moves
      // onto the heavy corpses (R8).
      else if (ENEMY_TYPES[typeId].chaff && !elite && state.wave.num >= C.E2.WAVE) {
        e.xp *= C.E2.CHAFF_XP_MULT;
      }
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
  // E2 (R3): the GUARANTEED debut. The horde wave's first spawn tick puts ONE
  // of each heavy type on the field through the same make/escalate/stamp
  // pipeline (plain bodies — no elite/rarity rolls), so the tier is SEEN the
  // moment it lands even when the thinned weighted walk would dally. Once per
  // run; the flag lives on state.wave (reset per run with the wave object).
  if (state.wave.num === C.E2.WAVE && !state.wave.e2HeavyDebut) {
    state.wave.e2HeavyDebut = true;
    const debut = ['BRUTE', 'DASHER', 'TICK', 'SHRIKE'];
    for (let i = 0; i < debut.length; i++) {
      const id = debut[i];
      const a = Math.random() * Math.PI * 2 + (i / debut.length) * Math.PI * 2;
      const d = C.ENEMY.SPAWN_DIST * (0.85 + Math.random() * 0.3);
      const e = makeTypedEnemy(id,
        state.player.x + Math.cos(a) * d,
        state.player.y + Math.sin(a) * d,
        state.time, { variant: rollVariant(id) });
      escalate(e, state.time);
      stampHeavy(e);
      recordEncounter(profile, 'enemy:' + id, { wave, at: state.time, tier: 'COMMON' });
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
//
// N1 (audit 2026-09-16): the writers used to coerce with `| 0` (int32 — wraps
// NEGATIVE past 2^31) while validateProfile repairs the purse into
// [0, MAX_SAFE_INTEGER]. The domains agree at ONE bound now, applied by this
// single clamp at every read-modify-write seam: [0, 2^31-1]. Inside that range
// every |0 read in the HUD/shop is exact, so no writer can wrap the purse
// negative regardless of what storage hands it.
const PURSE_MAX = 0x7FFFFFFF;
function purseClamp(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(PURSE_MAX, Math.max(0, Math.floor(n))) : 0;
}
function purseCredit(e) {
  // W7b RARE Gilded Palm: +30% purse gold per kill per pick, compounding. The
  // multiplier lives on the run's stats (1 = the shipped payout bit-for-bit,
  // CHAFF's 0 included), so the wallet keeps ONE writer and every consumer
  // (HUD, ledger, settle) reads the same number.
  const mult = (state.player && state.player.stats.purseKillMult) || 1;
  const v = Math.round(purseValue(e) * mult);
  const tier = purseTier(e);
  profile.runPurse = purseClamp(profile.runPurse + v);
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
  if (purseClamp(profile.runPurse) < amount) return false;
  profile.runPurse = purseClamp(profile.runPurse - amount);
  state.runCounts.gold.spent += amount;
  state.runPurse = profile.runPurse;
  persistProfile();
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
    `<br>GOLD ${purseClamp(profile.runPurse)} (this run) · BANK ${profile.gold}${interMsg ? '<br>' + interMsg : ''}`;
  menuCard('CONTINUE', 'into wave ' + (state.wave.num + 1) + ' [C]', () => continueRun());
  for (const [tier, def] of Object.entries(PAID_CHESTS)) {
    const cost = chestCost(def);
    const el = menuCard(tier + ' CHEST',
      `${cost} gold · gamble an item (${Math.round(def.nothingChance * 100)}% nothing)` +
      (shopPriceMult() !== 1 ? ' · CURSED PRICES' : ''),
      () => buyPaidChest(tier), purseClamp(profile.runPurse) < cost);
    if (purseClamp(profile.runPurse) < cost) el.onclick = () => audio.playSfx('button');
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
  // G24 slice 1: the dial now pays on BOTH channels (gold + the new per-kill
  // XP multiplier), and every readout states the payout, not only the cost.
  // Card is hidden once the ledger sits at HEAT_CAP.
  if (heatOf(state) < HEAT_CAP) {
    const nextGold = goldMult(manualPushes(state) + 1);
    const nextXp = heatXpMult(manualPushes(state) + 1);
    menuCard('RAISE THE STAKES',
      `+1 heat: foes +${Math.round(HEAT_CURVES.HP * 100)}% hp & swarm faster · run gold x${nextGold.toFixed(2).replace(/\.?0+$/, '')} · run xp x${nextXp.toFixed(2).replace(/\.?0+$/, '')}`,
      () => {
        addHeat(state, 'MANUAL_PUSH');
        interMsg = `STAKES RAISED — ${describeHeat(heatOf(state))} · ${describeHeatPayout(manualPushes(state))}`;
        audio.playSfx('levelup');
        openIntermission();   // re-render: gold line + card clamps at HEAT_CAP
      });
  }
  // ONBOARDING REWORK 2026-09-16: the 4 intermission cards are RETIRED —
  // that screen labels itself (CONTINUE, chest, blessing, stakes).
  // NIGHT MODE: arm the auto-CONTINUE once per intermission (the null guard
  // keeps a chest-buy re-render from resetting the countdown).
  if (state.nightRun && nightContinueLeft === null) {
    nightContinueLeft = C.AUTOPILOT.NIGHT_CONTINUE_S;
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
  if (purseClamp(profile.runPurse) < cost) return;
  const wallet = { gold: purseClamp(profile.runPurse) };
  const res = rollPaidChest(wallet, tier);
  if (!res.ok) return;
  // rollPaidChest debits the BASE cost; the Merchant's Pact surcharge is
  // taken here so loot.js stays untouched. Both writes go through the N1
  // clamp so a purse near the cap cannot wrap on the surcharge subtraction.
  profile.runPurse = purseClamp(wallet.gold - (cost - def.cost));
  state.runCounts.gold.spent += cost;
  state.runPurse = profile.runPurse;
  persistProfile();
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
  nightContinueLeft = null;   // NIGHT MODE: a human CONTINUE cancels the auto one
  const p = state.player;
  // PER-CONTROL INTRODUCTIONS: reaching CONTINUE means an intermission
  // happened — the moment stance and the pilot choice pay differently.
  introSawIntermission = true;
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
  // S1: shrines are world-seeded ONCE at run start (startRun) and static for
  // the whole run — no per-wave roll, no respawn.
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
  // WAVE-14 boss arrival, RESTORED 2026-09-17 (owner correction: "I didn't
  // intend on you removing the boss banner completely"). The no-play-area-
  // pixels rule is now SCOPE-LIMITED to the repeated mid-combat HORDE
  // WARNING (the herald, below); set-piece announcements — boss cast, elite,
  // finale — keep their prominent cinematic presentation. This is the
  // pre-rule behaviour: two-line centre banner, ttl 2.5.
  state.bossBanner = {
    names: cast.map(b => b.name),
    verb: cast.length > 1 ? 'APPROACH' : 'APPROACHES',
    title: cast.map(b => b.name).join(' + ') + (cast.length > 1 ? ' APPROACH' : ' APPROACHES'),
    sub: cast.length > 1
      ? cast.map(b => b.flavor.toUpperCase()).join(' / ')
      : cast[0].flavor.toUpperCase(),
    ttl: 2.5,
  };
  audio.playPortalCue('BOSS_YELL');
  easeToBossStance();       // BOSS_STANCE: the camera leans in; see CONFIG
}

// ---------- HORDE WARNING timing + direction (C.HUD.WARNING) ------------------
// PRESENTATION ONLY (review 2026-09-17): these govern the warning's LIFE, not
// the horde's — spawn timing, size and difficulty never read these helpers.
function warningTtl(etaS) {
  const W = C.HUD.WARNING;
  return Math.max(W.TTL_MIN, Math.min(W.TTL_MAX, etaS - W.CLEAR_MARGIN));
}
// Which screen edge a spawn angle enters from (world and canvas share y-down,
// and the camera window centres on the player, so the world offset maps
// directly onto screen sides).
function warningEdgeOf(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return Math.abs(c) >= Math.abs(s) ? (c > 0 ? 'right' : 'left') : (s > 0 ? 'bottom' : 'top');
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
  const edge = warningEdgeOf(a);   // the horde warning's edge cue (see below)
  const boss = makeTypedEnemy('CHASER',
    state.player.x + Math.cos(a) * d,
    state.player.y + Math.sin(a) * d,
    state.time);
  escalate(boss, state.time);
  // E2 (R2): the formula is config.js's midBossHp — the ONE definition the
  // wave-2 heavy tier also reads. Same factors in the same order as the old
  // inline expression (desc.hpMult * heat on top), so the herald's number is
  // byte-identical.
  const hp = midBossHp(state.wave.num, w) * desc.hpMult *
    heatMultipliers(heatOf(state)).hp;
  boss.hp = hp;
  boss.maxHp = hp;
  boss.w = Math.round(boss.w * M.SIZE_MULT * desc.sizeMult);
  boss.h = Math.round(boss.h * M.SIZE_MULT * desc.sizeMult);
  // Speed stays the makeTypedEnemy linear curve (BASE_SPEED * (1+0.05w)) —
  // SPEED_MULT pushes it above the player's 60px/s at every wave.
  boss.speed *= M.SPEED_MULT;
  const ttl = warningTtl(d / boss.speed);   // gone CLEAR_MARGIN before contact
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
  // 2026-09-17 scope-limited rule (owner correction): the HERALD is the
  // repeated mid-combat HORDE WARNING the no-play-area-pixels rule protects —
  // she is the fastest closer in the game, spawns once per wave, and the old
  // 2.5s centre banner was still on screen at first contact (review
  // addendum). Set-piece bosses and the finale are NOT routed here.
  state.bossBanner = {
    names: [desc.name], verb: 'APPROACHES',
    title: desc.name + ' APPROACHES', sub: desc.flavor.toUpperCase(),
    peripheral: true,
    ttl, dur: ttl, edges: [edge],
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
      // G21 slice 2 GLACIER: the direct-hit damage multiplier, read at THIS
      // damage site (the rider below rides the same hit) — blasts never see it.
      e.hp -= d * directHitMult(state, e); e.flash = 0.08;
      // G21 rider: the mine's PRIMARY payload is a direct weapon hit wherever
      // the detonation is triggered from (weapons.js detonateMine rides via
      // hurt(); this mirror rides identically).
      onWeaponHit(state, e);
      state.effects.push({ kind: 'mine_hit', x: e.x, y: e.y, age: 0, ttl: 0.12 });
    }
  }
  state.effects.push({ kind: 'mine_blast', x: mine.x, y: mine.y, radius: blast,
    shrapnel: WEAPONS.MINE.SHRAPNEL, age: 0, ttl: 0.35 });
  const i = state.projectiles.indexOf(mine);
  if (i >= 0) state.projectiles.splice(i, 1);
}

// Superconductor (ZAP+BEAM): each fired chain zap throws an EXTRA fork chain
// of zapExtraForks hops — a supplemental bolt walking nearest-first from the
// player, damage continuing the falloff curve past the base fire's depth.
function synergyZapFork(zw) {
  const extra = syn('zapExtraForks') || 0;
  const p = state.player;
  const baseDmg = synWeaponDmg('ZAP', WEAPONS.ZAP.DAMAGE_MULT);
  const points = [{ x: p.x, y: p.y }];
  const hit = new Set();
  let from = p;
  for (let k = 0; k < extra; k++) {
    const tgt = nearestFoe(from.x, from.y, hit);
    if (!tgt || Math.hypot(tgt.x - from.x, tgt.y - from.y) > WEAPONS.ZAP.CHAIN_RANGE) break;
    hit.add(tgt);
    // CHAIN ZAP REWORK (msg_01M2RENZ): the base fire now spends COUNT-1 hop
    // depths, so the supplemental fork's falloff continues past that depth
    // (the old (P.jumps || JUMPS)+1+k exponent read the retired ladder field).
    tgt.hp -= baseDmg * Math.pow(WEAPONS.ZAP.FALLOFF, WEAPONS.ZAP.COUNT + k) *
      directHitMult(state, tgt);   // G21 GLACIER (direct hit)
    tgt.flash = 0.08;
    onWeaponHit(state, tgt);   // G21 rider: zap-fork damage is a direct hit
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
    t.hp -= synWeaponDmg('ZAP', WEAPONS.ZAP.DAMAGE_MULT) * 0.5 * directHitMult(state, t);   // 50% falloff + G21 GLACIER
    t.flash = 0.08;
    onWeaponHit(state, t);   // G21 rider: the scythe-zap lash is a direct hit
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
  // FIRST-RUN PROLOGUE: the run clock starts at phase END — freezing
  // state.time here EXCLUDES the prologue from run duration, gold/second and
  // every pacing figure by construction (they all read state.time). The
  // phase tick below is the bound: drunk OR t >= MAX_S, never neither.
  // ADDENDUM (owner 2026-09-18): the pilot PAUSES while a banner is up, and
  // the bound counts UNPAUSED time only — a held banner freezes BOTH clocks
  // (t and walkT), so reading time never rushes a player mid-lesson.
  if (state.prologue) {
    if (!prologueBanner()) {
      state.prologue.t += dt;
      state.prologue.walkT += dt;
      if (!state.prologue.drunk && state.prologue.t >= C.PROLOGUE.MAX_S) {
        endPrologue('bound');
      }
    }
  } else {
    state.time += dt;
  }
  // RUN-STRUCTURE: the clock + the RUN SURVIVED win, checked before any damage
  // this frame can resolve. Reaching the limit is a victory, not a death.
  if (checkRunLimit()) return;
  if (p.invuln > 0) p.invuln -= dt;
  // PROLOGUE rainbow ring lifetime — parallel to p.invuln (it must survive on
  // its own so a later portal invuln refresh cannot restart the pulse).
  if (state.prologueShieldT > 0) state.prologueShieldT -= dt;
  // G33: rolling kill rate — one dt-driven EWMA step from the p.kills delta
  // (loot.js). No per-kill work in the death pass, no wall clock anywhere.
  state.killRateEwma = ewmaKillRate(state.killRateEwma,
    p.kills - state.killsAtRateTick, dt, C.POTIONS.ADAPTIVE.TAU);
  state.killsAtRateTick = p.kills;
  // G34/G36: refill the SHARED heal budget (dt-driven, clamped to one second's
  // budget; heal.js). Runs every frame so the rate is bounded whether or not a
  // hit lands this frame.
  state.healBudget = refillHealBudget(
    state.healBudget, dt, p.stats.maxHp, C.HEAL_BUDGET.CAP_FRAC);

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
        // ONBOARDING (teach-until-demonstrated): entering the portal IS the
        // taught action — the portal hint retires permanently, now.
        hintStore.setDone('portal');
        hintStrip.retire('portal');
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
  // E2 (R9): the nova is ground AoE — flyers take nothing (see flyingGuard).
  flyingGuard('blast', () => frostCardTick(state, dt));
  // N1 slice 3: the ults' per-frame windows (AFTERIMAGE phantoms, the
  // CONSECRATION field ticks) tick here beside the cast hand.
  // E2 (R9): phantom blasts and the consecration field are ground AoE too.
  flyingGuard('blast', () => updateUlts(state, dt));
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
        // dmg * critMult) + Vampiric lifesteal heals a fraction of damage
        // (through the G34 rate bucket).
        let dmg = pr.damage;
        if (evoCrit > 0 && Math.random() < evoCrit) {
          dmg *= evoCritMult;
          state.effects.push({ kind: 'hit_spark', x: pr.x, y: pr.y - 3, age: 0, ttl: 0.15 });
        }
        e.hp -= dmg * directHitMult(state, e); e.flash = 0.08; pr.hit.add(e); audio.playSfx('hit');
        onWeaponHit(state, e);   // G21 rider: the volley projectile is a direct hit
        if ((p.stats.lifesteal || 0) > 0) {
          // G34/G36: heal = min(dmg * lifesteal, budget) — the RATE is capped
          // through the SHARED budget (heal.js; harvest draws the same one),
          // the fraction still stacks from every source.
          const heal = healFromBudget(state.healBudget, dmg * p.stats.lifesteal);
          state.healBudget -= heal;
          p.hp = Math.min(p.stats.maxHp, p.hp + heal);
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
  // ARENA RELIEF: the stage's terrain character, read ONCE for the whole
  // enemy pass. The grade term at the move seam below is the SAME pure
  // function the pilot's own movement reads — a chaser climbs the ridge at
  // exactly the grade the pilot would (the anti-sanctuary symmetry).
  const relCfg = stageRelief(state.stage);
  const relSeed = state.groundSeed || 0;
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
    if (e.slow > 0) {
      e.slow -= dt;
      if (e.slow <= 0) e.slowMult = 0;   // G21 RIME: the chill's grip dies with it
    }
    // G21 slice 1 IGNITE: the burn DoT, dt-driven (60Hz and 120Hz pay the same
    // total). Burn damage is applied HERE — never through hurt/onWeaponHit, so
    // it never triggers riders; a burn-LETHAL tick stamps the corpse so the
    // death pass never detonates it (no chain-of-chains, the card's contract).
    if (e.burn > 0) {
      e.burn -= dt;
      e.hp -= (e.burnDps || 0) * dt;
      if (e.hp <= 0) e.burnLethal = true;
    }
    const spd = e.speed * (e.slow > 0 && !e.flying ? (e.slowMult || C.SKILLS.FROST_NOVA.SLOW_FACTOR) : 1) *
      (wm.enemySpeedMult || 1);      // SNOW: the horde trudges
    // E2 (R9): a flyer's altitude is drawn, never simulated — z is a pure
    // function of age (flyingZ: dt-free, so 60Hz and 120Hz fly the same
    // swoop), and frost slow above never grips it (the flyingGuard call-site
    // wrappers keep e.slow unstamped; the !e.flying read is the explicit
    // seam).
    if (e.flying) e.z = flyingZ(e);
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
    // ELEVATION v2 ROUTE BIAS: a PURSUING walker whose target stands on the
    // terrace >= CLIFF_STEP above routes its INTENT to the nearest ramp door
    // (reliefRampRoute — the anti-orbit fix; see relief.js). Gated on the
    // intent actually pointing at the player, so kiters, stationary pillars
    // and latched ticks keep their own doctrine. Bosses keep their own
    // action model; flyers overfly the cliffs by design.
    let mvx = act.mx, mvy = act.my;
    if (!e.flying && !e.boss && (mvx || mvy) &&
        mvx * (p.x - e.x) + mvy * (p.y - e.y) > 0) {
      const route = reliefRampRoute(e.x, e.y, p.x, p.y, relSeed, relCfg);
      if (route) { mvx = route[0]; mvy = route[1]; }
    }
    const grade = reliefGrade(e.x, e.y, mvx, mvy, relSeed, relCfg);
    // BLOCKING ELEVATION (ELEVATION v2): the same cliff rule + rampward slide
    // the pilot's move seam reads (reliefStep), so pilot and horde obey ONE
    // geometry — a walker pressed against a cliff face slides along it and
    // routes to a ramp (the funnel; the horde CLIMBS, so the upper path is
    // never a sanctuary). FLYERS are exempt: they fly over the cliffs, which
    // is exactly the vertical reach the horde-mix work will use.
    if (e.flying) {
      e.x += act.mx * spd * grade * dt;
      e.y += act.my * spd * grade * dt;
    } else {
      const stepped = reliefStep(e.x, e.y,
        e.x + mvx * spd * grade * dt,
        e.y + mvy * spd * grade * dt, relSeed, relCfg);
      e.x = stepped[0]; e.y = stepped[1];
    }
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
      // ARENA SCALE-UP: the ring plants inside the walls — the old literal
      // 590 duplicated RIM-10 by hand (WAVE-25 audit-2.4's last straggler).
      const ringRim = C.GROUND.RIM - 10;
      for (let s = 0; s < act.ring.count; s++) {
        const ang = (s / act.ring.count) * Math.PI * 2;
        const m = makeTypedEnemy(act.ring.type,
          Math.max(-ringRim, Math.min(ringRim, p.x + Math.cos(ang) * act.ring.radius)),
          Math.max(-ringRim, Math.min(ringRim, p.y + Math.sin(ang) * act.ring.radius)),
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
      // G19 slice 2: the character's INCOMING specialty term rides the existing
      // typeMult argument (the model's own per-enemy-type slot) — neutral
      // characters/types read exactly 1, so the number is byte-identical to
      // today's for everyone without a term.
      const hit = contactHitDamage(C.SURVIVAL.BASE_CONTACT, dmgMult,
        (e.contactDamageMult || 1) * specialtyIncomingMult(state.character && state.character.id, e.typeId),
        chargeMult, p.stats.maxHp);
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
      // F1 (audit 2026-09-16): the VAMPIRIC elite mod's contact heal, now
      // ATTRIBUTED and RATE-CAPPED. Attribution: only the elite that actually
      // landed THIS touch (touchKiller, selected above by largest hit) heals —
      // the old proximity scan (<13px) healed every lifesteal enemy near the
      // player, so N stacked vampiric elites healed N x per hit (measured 3x),
      // and the per-enemy scan is gone entirely (the F2 perf nit in the same
      // lines: O(1) now). Cap: the same token-bucket mechanism the G36 player
      // budget uses (heal.js), mirrored PER ELITE off the ELITE'S OWN maxHp —
      // refills at C.SURVIVAL.ELITE_VAMP_CAP_FRAC * e.maxHp per second, so a
      // lone elite heals byte-identically in ordinary play (measured typical
      // 8%/s sits under the 10%/s cap) while stacking and the hit-cap worst
      // case are bounded. Lazy bucket: no per-frame cost, initialized full on
      // the elite's first vampiric contact.
      if (touchKiller && touchKiller.hp > 0 && (touchKiller.lifesteal || 0) > 0) {
        const capFrac = C.SURVIVAL.ELITE_VAMP_CAP_FRAC;
        const budget1s = capFrac * touchKiller.maxHp;
        if (touchKiller.vampBudget === undefined) {
          touchKiller.vampBudget = budget1s;      // starts full (startRun precedent)
          touchKiller.vampT = state.time;
        } else {
          touchKiller.vampBudget = refillHealBudget(touchKiller.vampBudget,
            state.time - touchKiller.vampT, touchKiller.maxHp, capFrac);
          touchKiller.vampT = state.time;
        }
        const heal = healFromBudget(touchKiller.vampBudget, touchDmg * touchKiller.lifesteal);
        touchKiller.vampBudget -= heal;
        touchKiller.hp = Math.min(touchKiller.maxHp, touchKiller.hp + heal);
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
      // E2 (R6): plain chaff (the CHASER/SWARMER swarm — an elite is an
      // EVENT, never chaff) pays near-zero on every drop roll from the horde
      // wave on: potion, chest, evolution token and (at spawn) xp. The wave's
      // income moves onto the heavy corpses (R7/R8).
      const e2Chaff = state.wave.num >= C.E2.WAVE && !e.elite &&
        !!(ENEMY_TYPES[e.typeId] && ENEMY_TYPES[e.typeId].chaff);
      // COLOSSUS death shockwave: friendly-fire AoE vs nearby enemies
      // (victims earlier in the sweep get reaped next frame's death loop).
      const sw = deathShockwave(e);
      if (sw) {
        // E2 (R9): the shockwave is a ground blast — flyers take nothing.
        flyingGuard('blast', () => {
          for (const o of state.enemies) {
            if (o === e || o.hp <= 0) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) <= sw.radius) {
              o.hp -= sw.damage;
              o.flash = 0.08;
            }
          }
        });
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
      // numbers/price/hard gate, so there is ONE detonation implementation
      // and a rewrite-holding Witch still detonates each corpse exactly once.
      // G21 slice 1 IGNITE: a corpse the BURN killed never detonates (the
      // card's contract: burn damage never detonates anything — no
      // chain-of-chains). Stamped by the burn tick beside the slow decay.
      const boom = e.burnLethal ? null
        : (rewriteBoom(state) || (e.chainBoom ? boomBlast(state.player) : null));
      if (boom) {
        // CHAIN REACTION draws on the pool per detonation; a dry pool returns
        // null above and detonates nothing (the hard gate, owner 2026-09-17).
        if (boom.manaCost) state.player.mana -= boom.manaCost;
        // N1 slice 3: the application loop moved INTO rewrites.js applyBlast —
        // the ONE blast implementation the Rogue's AFTERIMAGE phantoms now
        // share (e is dead here, so applyBlast's hp<=0 guard covers the old
        // `o === e` skip). E2 (R9): a ground detonation — flyers take nothing.
        flyingGuard('blast', () => applyBlast(state, e.x, e.y, boom));
      }
      // G21 slice 2 WILDFIRE: a BURNING corpse hands its burn (remaining dps
      // and duration, full) to the nearest other live body within
      // WILDFIRE_RANGE, once per death. Written BESIDE the blast gate because
      // the spread does not depend on what killed the body; the transfer is a
      // burn application, never a weapon hit, so it moves no counter and fires
      // no rider (R3).
      wildfireTransfer(state, e);
      // G21 slice 2 STORM REAPER: a corpse the LIVE WIRE zap killed (the rider
      // stamped it) detonates a 50%-strength blast through the SAME applyBlast
      // path — a ground detonation, so the flyer exemption applies exactly as
      // it does to the kill boom above. ADDITIVE to the onkillboom detonation
      // the same corpse already fired; stated in the report.
      const zapBoom = e.zapLethal ? stormReaperBlast(state) : null;
      if (zapBoom) flyingGuard('blast', () => applyBlast(state, e.x, e.y, zapBoom));
      pushGem(makeGem(e.x, e.y, e.xp));
      // Potion drop roll (Scavenger dropBonus widens the base chance; the
      // roll lives here because skills.js's rollDrop is base-config only).
      // Alchemist's Blessing curse: dropChanceMult scales the whole chance.
      // WAVE-27: the drop position is clamped into the playable face
      // (clampLootToArena) — a kill outside the wall used to drop an
      // uncollectible potion out there. rng order is untouched (the clamp is
      // pure and runs before the kind roll).
      const dropChance = (C.POTIONS.DROP_CHANCE + (p.stats.dropBonus || 0) +
        (e.dropBonus || 0)) *   // G10: rarity tiers pay a drop bonus
        ((p.choices && p.choices.dropChanceMult) || 1) *
        (e2Chaff ? C.E2.CHAFF_DROP_MULT : 1) *   // E2 (R6): chaff pays ~zero
        adaptiveDropFactor(state.killRateEwma,   // G33: inverse to the swarm rate
          C.POTIONS.ADAPTIVE.REF_KPS, C.POTIONS.ADAPTIVE.FLOOR_FRAC);
      const drop = Math.random() < dropChance
        ? { ...clampLootToArena(e.x, e.y), kind: Math.random() < 0.5 ? 'hp' : 'mp' } : null;
      if (drop) pushDrop(drop);
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
        pushItemDrop({ x: bossLoot.x, y: bossLoot.y,
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
          pushItemDrop({
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
          // E2 (R6): plain chaff's chest roll scales to near-zero from the
          // horde wave on (the chance dial is chests.js's new chanceMult).
          maybeSpawnChest(state, e, Math.random, e2Chaff ? C.E2.CHAFF_DROP_MULT : 1);
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
      // E2 (R6): plain chaff's token roll is near-zero from the horde wave on
      // (a second thinning roll — the token channel's own rng is untouched).
      if (!e2Chaff || Math.random() < C.E2.CHAFF_DROP_MULT) maybeGrantToken('kill');
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
      if (o.hp > 0) pushGem(makeGem(o.x, o.y, o.xp));
    }
    state.enemies.length = 0;
    state.enemyShots.length = 0;   // no post-clear potshots
    state.wave.bosses = [];
    state.wave.boss = null;
    // ARENA SCALE-UP additions (msg_01M2R966): BOSS-CLEAR SWEEP. The wave is
    // won — the field's ground drops are swept to the pilot through the
    // magnet's own pull mechanics (visible motion toward the player; the
    // CREDIT still happens only in the normal pickup loop, so collection is
    // worth exactly collection on foot) and the collected total is toasted
    // as part of the boss-clear moment. NO silent loss: nothing is deleted,
    // and what the run's own rules refuse (an over-cap potion, an IGNOREd
    // equip) honestly stays on the floor at the pilot's feet. Armed AFTER
    // the scatter above so the fresh corpse-gems ride the same sweep.
    p.bossSweep = C.BOSS_SWEEP.SWEEP_S;
    state.bossSweepSnap = {
      gems: state.gems.length,
      potions: (state.drops || []).reduce((s, d) => s + (d.count || 1), 0),
      items: (state.itemDrops || []).length,
    };
    state.effects.push({ kind: 'magnet', x: p.x, y: p.y, age: 0,
      ttl: C.BOSS_SWEEP.SWEEP_S + 0.15, radius: C.BOSS_SWEEP.RING_RADIUS });
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
  // M1 (C2): the per-frame atlas read — marks the cells the player can see
  // and flips any landmark he reached. ONE tracker: the map screen and the
  // radar both read state.atlas. Pure function of position (no dt, no rng),
  // so 60Hz and 120Hz mark the identical set.
  if (state.atlas) {
    atlasUpdate(state.atlas, p.x, p.y, C.ATLAS.VISIT_RADIUS, C.ATLAS.DISCOVER_RADIUS);
  }
  // WAVE-11 RUN SHRINES (shrines.js): the pilot is shrine-BLIND (controllers
  // never learn shrines exist). S1 (owner directive 2026-09-14): the set is
  // world-seeded ONCE at run start and STATIC — the ~6px/s lean toward the
  // player is gone ("static means static"; the DRIFT.ARCH coupling is removed
  // from this path only — arches keep theirs above). On proximity, gold buys
  // ONE random intermission-style blessing (choices.js semantics, repeat-free
  // across the whole run). Per-run only: shrines never touch persistence
  // beyond the purse debit (paid-chest precedent).
  // E1: the shrine debits the RUN PURSE (profile.runPurse), never the bank —
  // in-run gold buys in-run powers.
  for (const sh of state.shrines) {
    if (sh.used) continue;
    const dx = p.x - sh.x, dy = p.y - sh.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len < 26) {
      if (!sh.blessing) {
        // Roll + cache once per shrine (rng stream: shrineRng, seeded off the
        // run seed — never desyncs the intermission choice rolls).
        sh.blessing = shrineBlessing(state.wave.num - 1, state.shrineRng || Math.random,
          state.takenChoices);
      }
      if (!sh.blessing) {
        sh.used = true;   // blessing pool exhausted — the altar goes dark
      } else if (canAfford(purseClamp(profile.runPurse), sh.blessing.cost) && purseSpend(sh.blessing.cost)) {
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
      if (sh.used) {
        // S1: advance the render/tour VIEW to the next unsold altar. This is
        // the only place the view moves — event-driven, never per-frame.
        state.shrine = state.shrines.find(s => !s.used) || null;
      }
    }
  }
  for (const ev of chestEvents) {
    if (ev.kind === 'chestOpened') {
      toast('CHEST OPENED: ' + ev.rarity.toUpperCase(),
        RARITY_TINTS[ev.rarity.toUpperCase()] || null);   // WAVE-14 feed tint
      audio.playSfx('chest');
      // PALADIN bless: heal on chest open. G19: the per-level Blessed Chests
      // row rides stats.healOnChest (stamped by applyCharacterUpgrades at the
      // run seam); every character without the row has no key, so the def
      // fallback below is byte-for-byte today's behaviour.
      const heal = p.stats.healOnChest != null ? p.stats.healOnChest
        : (state.character ? (state.character.healOnChest || 0) : 0);
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
      pushItemDrop({ x: ev.x, y: ev.y, item: ev.item, age: 0 });
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
  // FIRST-RUN PROLOGUE: the prologue potion uses the SAME pickup semantics
  // (the same radius, the same loop position) — it is just not an inventory
  // potion; drinking it runs the prologue payoff instead.
  if (state.prologue && !state.prologue.drunk) {
    const po = state.prologue.potion;
    if (Math.hypot(po.x - p.x, po.y - p.y) < pickR) prologueDrink(p);
  }
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    if (Math.hypot(d.x - p.x, d.y - p.y) < pickR) {
      if (p.potions[d.kind] < state.potionCap) {   // G11: the run's rule ceiling
        // M3: a merged ground potion carries a count (overflow merges same-
        // kind drops value-preservingly). Pay out as many as the potion cap
        // allows; the remainder STAYS on the ground — value is never created
        // or destroyed. count 1 (the never-merged case) is byte-identical.
        const want = d.count || 1;
        const take = Math.min(want, state.potionCap - p.potions[d.kind]);
        p.potions[d.kind] += take;
        if (take >= want) state.drops.splice(i, 1);
        else d.count = want - take;
        toast((d.kind === 'hp' ? 'HEALTH' : 'MANA') + ' POTION FOUND');
        // G8 step 2 BLOOD HARVEST rewrite: the PICKUP retaliates. Hooked on
        // the collect path (NOT drinkPotion — the ask is "health pickups also
        // damage"); the blast is enemy-side only, centered on the player.
        const blast = d.kind === 'hp' ? harvestBlast(state) : null;
        if (blast) {
          // E2 (R9): a ground blast — flyers take nothing (see flyingGuard).
          flyingGuard('blast', () => {
            for (const o of state.enemies) {
              if (o.hp <= 0) continue;
              if (Math.hypot(o.x - p.x, o.y - p.y) <= blast.radius) {
                o.hp -= blast.damage;
                o.flash = 0.08;
              }
            }
          });
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
  // G21 slice 1 AFTERSHOCK: scheduled detonation echoes fire HERE, dt-driven,
  // through the ONE blast path — a ground blast, so flyers take nothing.
  flyingGuard('blast', () => tickRewriteEchoes(state, dt));
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
      // G24 slice 1: the SECOND heat payout channel. heatXpMult tracks MANUAL
      // pushes only (the symmetry rule — built-in heat stays cost-only), read
      // here at the ONE kill-XP site alongside the Scholar/SUNNY/rampage
      // multipliers. At manual 0 it is exactly 1, so a non-heat run's income
      // is byte-identical to before.
      p.xp += gm.xp * (p.stats.xpMult || 1) * (wm.xpMult || 1) * rampageMult() * heatXpMult(manualPushes(state));
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
  // A queued/new draft supersedes any live pick ceremony — the cards are
  // re-rendered below, so the ceremony must not tear down what it no longer
  // owns (endDraftCeremony(false) leaves the display to this presenter).
  if (draftCeremony) endDraftCeremony(false);
  // PER-CONTROL INTRODUCTIONS: a draft IS the first level-up — the moment
  // focus and the field report start to matter.
  introSawDraft = true;
  state.mode = 'draft';
  ovTitle.className = '';
  // Weapon-scoped pool (megabonk rework), G26 RE-SCOPED (owner 2026-09-15:
  // "Player chosen weapons in a menu, not during run... Replaces in run
  // cards"): there are NO wpn_* grant offers any more — the run never hands
  // you a weapon you did not bring. What starts in state.weapons (startRun:
  // the pre-run LOADOUT choice, or the default kit) is what the whole run
  // carries, so the weapon side of the pool is LEVEL-UP cards for exactly the
  // brought kit (+ the base volley). Global stat cards keep their weights, so
  // the draft still reads weapon-tilted while a draft lasts.
  const weaponCards = [];
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
    // REWRITE_CARD_WEIGHT, one card per rewrite not already held. G21 slice 2:
    // FOURTEEN cards now, and the family share is held by WEIGHT CLASS rather
    // than one flat number — eleven single-tag/legacy cards at
    // REWRITE_CARD_WEIGHT, three cross-tag combos at half weight (12.5 x
    // 0.005 = 0.0625, inside the goal's [0.055, 0.070] band); rewriteCards
    // carries the per-card weight, so the pool needs no special case.
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
    // ONE activation takes the card (owner directive 2026-09-15: the text is on
    // the card, so there is no confirm step) — see activateDraftCard below.
    // HELP MODE: a tap on a draft card explains it and picks NOTHING.
    el.onclick = () => {
      if (state.helpMode) { showHelpTip('<b>' + u.name + '</b> — ' + (u.desc || ''), el); return; }
      activateDraftCard(u);
    };
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
  // G30: every presented draft re-arms the AUTO countdown (the coach above
  // suspends it until dismissed — tickDraftAutoPick).
  armDraftAutoPick(choices);
}

// ---------- DRAFT CARD ACTIVATION: ONE ACTIVATION TAKES THE CARD ------------
// OWNER DIRECTIVE 2026-09-15 (Sk408, verbatim): "with the text boxes in the card
// select, we don't need the confirm step. It can go back to just touching will
// choose that card." — so the R2 inspect->confirm step (2026-09-14) is RETIRED.
// The reason it existed is gone: the card ITSELF now carries the art, the name,
// the tier badge, its own COMPUTED effect text (built at offer time by the real
// pool code — Second Wind's revive fraction, Iron Heart's percent, a weapon
// level's actual deltas out of describeWeaponLevel), the synergy hint and the
// [N] key hint, so there is nothing left for a second screen to reveal. One
// activation picks; tap/click, and arrows + Enter on the keyboard, are the same
// single confirmation. The 1-4 number keys stay the one-press quick-pick they
// always were (test_w7b_draft_ladder pins a single [4] press taking the fourth
// offer). ESC does nothing here by design: with no intermediate state there is
// nothing to back out of.
let draftFocus = -1;       // keyboard cursor over the offer row (-1: none)

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

// The ONE activation seam every pointer and keyboard path takes: it TAKES the
// offer. There is no first-activation branch to make — see the directive above.
function activateDraftCard(u) {
  if (!u) return;
  // CEREMONY GUARD: after pick() resolves a draft the overlay can stay up
  // briefly for the ceremony while the sim already runs underneath. The
  // still-visible cards keep their onclick, so a second tap in that window
  // arrives HERE — it must be inert (the draft is closed; the number keys are
  // already gated by the 'draft' mode router, this closes the pointer path).
  if (state.mode !== 'draft') return;
  pick(u);
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
  draftFocus = -1;
  // DRAFT PICK CEREMONY: the PICK is unchanged and lands THIS call — mode
  // flips now, so a MANUAL tap resumes with zero added latency and the
  // G30 auto-pick timing/count contracts are untouched. The ceremony is pure
  // presentation: the resolved cards stay up over the LIVE game for
  // DRAFT_CEREMONY_S (the chosen card lifts, the others disintegrate), then
  // the frame loop tears the overlay down. Reduced motion: no ceremony at
  // all — the overlay drops exactly as it did before the feature.
  if (draftCeremonyEnabled()) {
    startDraftCeremony(u);
  } else {
    overlay.style.display = 'none';
  }
  state.mode = 'playing';
  clearDraftAutoPick();   // G30: the draft resolved — no timer may outlive it
}

// ---------- G30 AUTO DRAFT AUTO-PICK (owner 2026-09-16) -----------------------
// Owner, verbatim: "Can we add so on auto, the card selection screen has a 6
// second timeout and then it auto picks a random card." The pilot drives
// movement, potions and casts — the DRAFT is the one screen that still parks
// an AUTO run on a modal waiting for a human. In AUTO, after
// CONFIG.AUTOPILOT.DRAFT_TIMEOUT seconds of VISIBLE, unobstructed draft the
// pilot takes a card uniformly at random through activateDraftCard — the
// ONE activation seam a tap and the number keys take — so every side effect
// (WAVE-11 taper, the `once` ledger, achievements, purse, audit) is
// byte-identical to a human pick.
//   * AUTO ONLY: a MANUAL player sees no countdown line and never gets an
//     auto-pick (the tick and the line both gate on normalizePilotMode).
//   * frame-driven from the frame loop's wall-clock dt, NOT setTimeout:
//     'draft' mode freezes the sim, so the sim clock cannot carry it, and a
//     frame timer stops on its own when the tab hides.
//   * SUSPEND, not run, while the draft coachmark (or any tour) rides on
//     top, another mode owns the screen, or the document is hidden — resume
//     where it left off: the player is owed the full window of unobstructed
//     draft. Re-armed by every openDraft().
//   * never twice for one draft (the `done` latch); a human tap during the
//     countdown resolves the draft through pick(), which clears the timer.
let draftTimer = null;            // { left: seconds remaining, done: picked }
let draftOffers = [];             // the CURRENT draft's offers, captured at
                                  // presentation (openDraft) — the DOM card
                                  // elements are presentation, not the source
                                  // of truth, so expiry never re-reads them
let draftCountdownEl = null;      // the "AUTO-PICK IN 4.2s" line
let draftAutoRng = Math.random;   // injectable rng (chests.js :291 pattern)
let draftAutoCount = 0;           // test seam: auto-picks made
let draftAutoLastId = null;       // test seam: the last auto-picked offer id

function draftObstructed() {
  if (state.mode !== 'draft') return true;
  // MANUAL never auto-picks: the countdown is suspended (not reset), so a
  // flip to AUTO mid-draft owes the player the full unspent window.
  if (normalizePilotMode(state.pilotMode) === 'MANUAL') return true;
  // NIGHT MODE: a coach must not park an unattended run — the countdown runs
  // through it (the coach's own DOM is untouched).
  if (coachActive() && !state.nightRun) return true;
  try { return !!(typeof document !== 'undefined' && document && document.hidden); }
  catch { return false; }
}

function armDraftAutoPick(offers) {
  // Armed on every presentation (MANUAL included): the TICK and the LINE are
  // what gate on AUTO, so a player who flips AUTO mid-draft gets the full
  // window from that moment, and a MANUAL player gets nothing at all.
  // The window is the FIXED DRAFT_TIMEOUT (the retired INSTANT preference
  // armed at 0 — the delay is the pacing feature, see the retirement note
  // above; no reachable state may shorten it).
  draftOffers = Array.isArray(offers) ? offers : [];
  draftTimer = { left: C.AUTOPILOT.DRAFT_TIMEOUT, done: false };
  updateDraftCountdownLine();
}

function clearDraftAutoPick() {
  draftTimer = null;
  draftOffers = [];
  if (draftCountdownEl) {
    if (draftCountdownEl.remove) draftCountdownEl.remove();
    else if (draftCountdownEl.parentNode) draftCountdownEl.parentNode.removeChild(draftCountdownEl);
    draftCountdownEl = null;
  }
}

function updateDraftCountdownLine() {
  const show = state.mode === 'draft' && draftTimer && !draftTimer.done
    && normalizePilotMode(state.pilotMode) !== 'MANUAL';
  if (!show) {
    if (draftCountdownEl) {
      if (draftCountdownEl.remove) draftCountdownEl.remove();
      else if (draftCountdownEl.parentNode) draftCountdownEl.parentNode.removeChild(draftCountdownEl);
      draftCountdownEl = null;
    }
    return;
  }
  if (!draftCountdownEl || !draftCountdownEl.parentNode) {
    draftCountdownEl = document.createElement('div');
    draftCountdownEl.id = 'draft-autopick';
    // Small and unemphatic by design: it must never read as the primary
    // action. Inline style — the draft overlay's own inline-style precedent
    // (the tier badge above).
    if (draftCountdownEl.style && draftCountdownEl.style.cssText !== undefined) {
      draftCountdownEl.style.cssText =
        'margin:2px auto 6px;width:max-content;font-size:11px;letter-spacing:1px;color:#6a6a8a;';
    }
    if (typeof overlay.insertBefore === 'function' && ovCards && ovCards.parentNode === overlay) {
      overlay.insertBefore(draftCountdownEl, ovCards);
    } else {
      overlay.appendChild(draftCountdownEl);
    }
  }
  draftCountdownEl.textContent = 'AUTO-PICK IN ' + Math.max(0, draftTimer.left).toFixed(1) + 's';
}

function tickDraftAutoPick(dt) {
  if (!draftObstructed() && draftTimer && !draftTimer.done) {
    draftTimer.left -= dt;
    if (draftTimer.left <= 0 && draftOffers.length) {
      draftTimer.done = true;   // latch FIRST: never two picks for one draft
      // Uniformly at random across the offered cards (captured at
      // presentation), through the ONE activation seam (activateDraftCard) —
      // byte-identical to a tap.
      const u = state.nightRun
        ? draftOffers[nightDraftPickIndex(draftOffers)]   // NIGHT: highest tier, first slot on tie
        : draftOffers[Math.min(draftOffers.length - 1, Math.floor(draftAutoRng() * draftOffers.length))];
      draftAutoCount++;
      draftAutoLastId = u.id;
      activateDraftCard(u);
      return;   // pick() closed (or chained into) the next draft
    }
  }
  updateDraftCountdownLine();
}

// ---------- NIGHT MODE (opt-in full auto, owner 2026-09-17) --------------------
// Owner, verbatim: "Yes, full auto run is one of the toughest balances without
// skipping the content. We can try it though. Let's start it at half gold.
// Still too much but could let more people 'finish' the game which also feels
// rewarding." The authorized exception to the feature freeze.
//
// WHAT IT IS: with the toggle ON (title SETUP, two confirming presses, OFF by
// default), every run plays itself end to end — the pilot already drives
// movement/casts/potions; the DRAFT auto-pick, the intermission CONTINUE, the
// run-end RETRY and the two cinematics are the beats that still parked an auto
// run on a human, and each now fires on a NAMED wall-clock delay
// (CONFIG.AUTOPILOT.NIGHT_CONTINUE_S / NIGHT_RESTART_S). Runs auto-restart
// with the SAME build and arena (startRun re-reads the persisted loadout,
// character, pending challenge and pending stage — RETRY's exact contract).
//
// NO SKIPPING THE CONTENT: a night run still fights every wave, drafts every
// card, meets elites and bosses. The ONE auto-skip is the escape minigame (an
// unattended run cannot play a side-scroller) — the known content gap, and
// part of why the 50% rate is defensible.
//
// THE DRAFT POLICY (one documented rule, no heuristic knob): take the
// HIGHEST-TIER offer — MYTHIC beats RARE beats everything else — and the
// FIRST SLOT on a tie. Deterministic: the same offers always pick the same
// card.
let nightArmed = false;          // the SETUP card's two-press confirm
let nightSession = null;         // { t0, gold0 } while the night runs on
let nightContinueLeft = null;    // s left on the intermission auto-CONTINUE
let nightRestartLeft = null;     // s left on the end-card auto-RETRY
let nightEvolveLeft = null;      // s left on the EVOLUTION overlay auto-pick
let nightStall = { mode: null, t: 0 };   // watchdog: one waiting mode, held how long

export function nightDraftPickIndex(offers) {
  const rank = (u) => (u && u.tier === 'MYTHIC') ? 2 : (u && u.tier === 'RARE') ? 1 : 0;
  let best = 0;
  for (let i = 1; i < offers.length; i++) if (rank(offers[i]) > rank(offers[best])) best = i;
  return best;   // strict > keeps the FIRST slot on a tie
}

function tickNight(realDt) {
  if (state.nightRun && nightContinueLeft !== null && state.mode === 'intermission') {
    nightContinueLeft -= realDt;
    if (nightContinueLeft <= 0) {
      nightContinueLeft = null;
      if (state.mode === 'intermission') continueRun();
    }
  }
  if (state.nightRun && nightRestartLeft !== null && state.mode === 'dead') {
    nightRestartLeft -= realDt;
    if (nightRestartLeft <= 0) {
      nightRestartLeft = null;
      startRun();   // same build, same arena: RETRY's contract
    }
  }
  if (state.nightRun && nightEvolveLeft !== null && state.mode === 'evolve') {
    nightEvolveLeft -= realDt;
    if (nightEvolveLeft <= 0) {
      nightEvolveLeft = null;
      if (state.mode === 'evolve') {
        const cands = evolutionCandidates();
        if (cands.length) doEvolve(cands[0]);   // first candidate: the draft policy's first-slot rule
        else closeEvolve();                      // candidates vanished under us: just leave the overlay
      }
    }
  }
  // NIGHT STALL WATCHDOG (defect follow-up 2026-09-17: the owner reported a
  // night run parked on the end-of-run summary). The named timers above cover
  // the transitions they were wired to; this covers EVERYTHING ELSE that could
  // leave an unattended run standing still: if any single waiting mode of the
  // run ladder is held longer than NIGHT_STALL_S, advance it through that
  // mode's own sanctioned action (the same call the named timer makes, so the
  // watchdog can only ever do early what the timer would have done — never
  // anything a human path does differently). Deliberately NOT fired on the
  // live modes (playing/finale — the run IS moving), the human surfaces
  // (title/intro), or the pause screens a present human is reading
  // (settings/stats): those are not stalls.
  if (state.nightRun) {
    const m = state.mode;
    if (m === 'dead' || m === 'intermission' || m === 'escape' || m === 'draft' ||
        m === 'evolve' || m === 'portal-cine' || m === 'death-cine') {
      if (nightStall.mode !== m) nightStall = { mode: m, t: 0 };
      else {
        nightStall.t += realDt;
        if (nightStall.t >= C.AUTOPILOT.NIGHT_STALL_S) {
          nightStall = { mode: null, t: 0 };
          nightUnstick(m);
        }
      }
    } else {
      nightStall = { mode: null, t: 0 };
    }
  } else {
    nightStall = { mode: null, t: 0 };
  }
}

// The watchdog's one action: per waiting mode, the same advance its own named
// timer / auto path would have made. A thrown error here must not wedge the
// loop either, so each action is isolated and the watchdog re-arms (the stall
// clock restarts; a persistent failure surfaces as a 30s cadence, not a freeze).
function nightUnstick(m) {
  try {
    if (m === 'dead') startRun();
    else if (m === 'intermission') continueRun();
    else if (m === 'escape') ESCAPE.skip();
    else if (m === 'draft') {
      if (draftOffers && draftOffers.length && draftTimer && !draftTimer.done) {
        draftTimer.done = true;
        draftAutoCount++;
        const u = draftOffers[nightDraftPickIndex(draftOffers)];
        draftAutoLastId = u.id;
        activateDraftCard(u);
      }
    } else if (m === 'evolve') {
      // the same action the named timer makes (main.js doEvolve) — first
      // candidate, the draft policy's first-slot rule
      const cands = evolutionCandidates();
      if (cands.length) doEvolve(cands[0]);
      else closeEvolve();
    } else if (m === 'portal-cine') endPortalCine();
    else if (m === 'death-cine') endDeathCine();
  } catch (e) { /* the loop lives; the stall clock restarts on the next tick */ }
}

// The SETUP card's ONE handler. First press ARMS (the toggle must not be
// reachable by accident); the second turns the night on. Turning OFF is a
// single press and writes the return-to-game summary the title renders.
function toggleNight() {
  if (state.night) {
    state.night = false;
    nightArmed = false;
    if (nightSession) {
      state.nightSummary = {
        awayS: Math.max(0, (Date.now() - nightSession.t0) / 1000),
        gold: profile.gold - nightSession.gold0,
        mult: (100 - RUN_GOLD.NIGHT_PENALTY_PCT) / 100,
      };
      nightSession = null;
    }
    audio.playSfx('button');
    return;
  }
  if (!nightArmed) { nightArmed = true; audio.playSfx('button'); return; }
  nightArmed = false;
  state.night = true;
  state.nightSummary = null;   // a new night replaces the old line
  nightSession = { t0: Date.now(), gold0: profile.gold };
  audio.playSfx('levelup');
}

// ---------- DRAFT PICK CEREMONY (owner 2026-09-16) -----------------------------
// The chosen card scales/brightens and settles; the others disintegrate with a
// STEPPED (crackle) fade — never a smooth ease. The whole ceremony is
// presentation over an already-resolved draft:
//   * the PICK lands in pick() this frame (mode flips there — zero added
//     latency for a manual tap, byte-identical auto-pick timing/count);
//   * the overlay merely STAYS UP DRAFT_CEREMONY_S over the live game, with
//     pointer-events off so taps pass through to the running sim;
//   * frame-driven off the frame loop's wall-clock dt (same rule as
//     tickDraftAutoPick) — no setTimeout, deterministic headless;
//   * ONE timing constant + ONE class-name pair (the CSS in index.html and
//     the tests agree on exactly these names);
//   * any screen that takes the overlay over (a queued draft, the field
//     report, death, the title) supersedes the ceremony — it stands down
//     without touching what that screen drew;
//   * prefers-reduced-motion: the ceremony is cut to the resolved state (the
//     overlay drops at the pick, exactly the pre-ceremony behaviour). The
//     query is scoped to THIS animation only — nothing else reads it.
const DRAFT_CEREMONY_S = 0.45;            // <= 0.5s by spec; covers lift+settle
const CEREMONY_CHOSEN_CLS = 'card-picked';   // the chosen card's emphasis mark
const CEREMONY_BURN_CLS = 'card-burn';       // the others' disintegration mark
const CEREMONY_FLAG_CLS = 'draft-ceremony';  // the overlay's own ceremony flag
let draftCeremony = null;                    // { left } | null

function draftCeremonyEnabled() {
  try {
    return !(typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { return true; }
}

function setDraftCeremonyFlag(on) {
  if (overlay.classList && typeof overlay.classList.add === 'function') {
    if (on) overlay.classList.add(CEREMONY_FLAG_CLS);
    else overlay.classList.remove(CEREMONY_FLAG_CLS);
    return;
  }
  const cur = String(overlay.className || '').split(' ').filter(c => c && c !== CEREMONY_FLAG_CLS);
  if (on) cur.push(CEREMONY_FLAG_CLS);
  overlay.className = cur.join(' ');
}

function startDraftCeremony(u) {
  const chosen = Array.from(ovCards.children).find(el => el._draftOffer === u) || null;
  for (const el of Array.from(ovCards.children)) {
    el.className = String(el.className || '') + ' ' +
      (el === chosen ? CEREMONY_CHOSEN_CLS : CEREMONY_BURN_CLS);
  }
  setDraftCeremonyFlag(true);
  overlay.style.pointerEvents = 'none';   // taps pass through to the live game
  draftCeremony = { left: DRAFT_CEREMONY_S };
}

// `ownOverlay` true only when the ceremony still owns the screen (mode stayed
// 'playing'): it hides the overlay and clears the cards. When superseded, the
// taking screen owns all of that — only the ceremony's own state is dropped.
function endDraftCeremony(ownOverlay) {
  if (!draftCeremony) return;
  draftCeremony = null;
  setDraftCeremonyFlag(false);
  overlay.style.pointerEvents = '';
  for (const el of Array.from(ovCards.children)) {
    el.className = String(el.className || '')
      .split(' ').filter(c => c && c !== CEREMONY_CHOSEN_CLS && c !== CEREMONY_BURN_CLS).join(' ');
  }
  if (ownOverlay) {
    ovCards.innerHTML = '';
    overlay.style.display = 'none';
  }
}

function tickDraftCeremony(dt) {
  if (!draftCeremony) return;
  if (state.mode !== 'playing') { endDraftCeremony(false); return; }
  draftCeremony.left -= dt;
  if (draftCeremony.left <= 0) endDraftCeremony(true);
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
  // The evolve overlay bypasses openMenu — supersede a live pick ceremony
  // here too (it would otherwise block the evolve cards' clicks for a frame
  // with its pointer-events gate). Placed AFTER the candidates gate: this
  // function runs every update(), and only an ACTUAL evolve screen takes the
  // overlay over.
  if (draftCeremony) endDraftCeremony(false);
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
    el.onclick = () => doEvolve(w);
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
  // NIGHT MODE (gap found 2026-09-18): this overlay was human-click-only —
  // an unattended run with a token over a maxed weapon parked here forever.
  // Same named-timer shape as CONTINUE/RETRY: the night takes the FIRST
  // candidate after NIGHT_EVOLVE_S (the draft policy's first-slot rule).
  if (state.nightRun) nightEvolveLeft = C.AUTOPILOT.NIGHT_EVOLVE_S;
}

// The ONE evolve action — the card's own onclick path, shared verbatim with
// the night auto-pick (never a second implementation of the same transition).
function doEvolve(w) {
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
// `cause` the cause line, `gold` this run's payout, `parts` settleRunGold's
// breakdown (only the GOLD POOL multiplier clause reads it now).
//
// END-SUMMARY CONTENT PASS (owner 2026-09-17, msg_01M2RVD9HHZZDSR7FKNTRRSSY5
// + addendum: "no more than five lines above the buttons; one gold line with
// at most two numbers, earned and banked; the freed space is NOT for more
// text"). The shape, top to bottom:
//   1. the LEAD line, carrying the run's identity clauses (NIGHT / APEX /
//      challenge / stage — G25/G11/G20a's clean-clear protection, FOLDED into
//      the one line instead of stacked) and the run's numbers.
//   2. KILLED BY (death only) — its own label, structurally incapable of
//      sitting over data (its own line, DOM-composed, HUD suppressed).
//   3. THE ONE GOLD LINE — GOLD EARNED +N · BANK N, exactly two numbers. The
//      E1 award/purse breakdown line and the G24 STAKES PAID line are RETIRED
//      from the card (every number they carried is inside GOLD EARNED; the
//      per-run breakdown lives in the settle/ledger seam, not the player's
//      3-second read). Disclosed supersession: E1 (2026-09-14) wanted the two
//      payout parts named separately; this pass's one-gold-line rule wins.
//   4. GOLD POOL multiplier — only when the pool is non-neutral (the
//      challenge-gold directive stands: the bigger number is EXPLAINED, not
//      mysterious; a standard stakes-free run renders no clause).
//   5. NEXT UNLOCK — omitted entirely when every row is owned (no filler).
function endScreenBody({ lead, cause = null, gold, firstClear, parts = null }) {
  const goal = nextUnlockWithinReach(profile);
  const tags = [];
  if (state.nightRun) tags.push('NIGHT RUN');
  if (state.apexRun) tags.push('APEX RUN');
  if (!isDefaultStage(state.stage)) tags.push(stageOf(state.stage).name);
  if (!isStandard(state.challenge)) tags.push(challengeOf(state.challenge).name + ' RUN');
  let html = lead;
  for (const t of tags.slice().reverse()) html = `<span class="cause">${t}</span><br>` + html;
  if (cause) html += `<br><span class="cause">KILLED BY ${cause}</span>`;
  html += `<br><span class="earn">GOLD EARNED: +${gold}` +
    `${firstClear ? ' (NEW BEST TIME!)' : ''} · BANK ${profile.gold}</span>`;
  const gp = parts && parts.goldPool;
  if (gp && (gp.night > 0 || gp.challenge > 0 || gp.heat > 0)) {
    const bits = ['100%'];
    if (gp.night > 0) bits.push(`NIGHT -${Math.round(gp.night * 100)}%`);
    if (gp.challenge > 0) bits.push(`CHALLENGE +${Math.round(gp.challenge * 100)}%`);
    if (gp.heat > 0) bits.push(`HEAT +${Math.round(gp.heat * 100)}%`);
    html += `<br><span class="pool">GOLD POOL x${(+gp.total).toFixed(2)} (${bits.join(' + ')})</span>`;
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
  // S1 (audit 2026-09-16): settlement is RUN-ONCE. The maw milestone settles
  // mid-run and the run CONTINUES — every later ending (runSurvived / die /
  // endRun) used to settle AGAIN, paying RUN_GOLD.AWARD twice, re-paying
  // FIRST_CLEAR, and folding the FULL run summary into lifetime totals a
  // second time (achievements.js recordRun bumps are read-then-add). A second
  // call now returns the first settlement's numbers unchanged. (The purse
  // zeroing below guards a DIFFERENT trap — the double-BANK of the remainder —
  // and stays.) Cleared in startRun.
  if (state.runSettled) return state.runSettled;
  const p = state.player;
  const firstClear = state.time > (profile.bestTime || 0);
  // E1 (owner directive 2026-09-14): the end-of-run meta award is a FIXED
  // amount — computeRunGold is RETIRED as the payout authority (it stays a
  // pure helper with its own test). The goldMult chain (GREED x manual stakes
  // x rampage best) multiplies the AWARD only; FIRST_CLEAR and the maw /
  // completion winBonus stay SEPARATE additions on top. Performance pays
  // through the banked purse remainder: the run's tier-weighted in-run
  // earnings land here, unspent.
  // THE ADDITIVE GOLD POOL (owner 2026-09-17: challenge gold is "200%
  // additive"). The AWARD's percentage bonuses SUM — never multiply:
  //   pool = 100% base + CHALLENGE bonus (+RUN_GOLD.CHALLENGE_BONUS_PCT
  //          percentage points, any non-standard mode)
  //        + HEAT bonus (+HEAT_CURVES.GOLD per manual stakes push)
  // (a NIGHT-MODE penalty joins this same pool when that mode lands). The
  // performance axis — shop goldMult x rampage best — multiplies the POOL
  // result; those are stats, not stated-percentage bonuses, and were not part
  // of the named formula. The pool applies to the AWARD only, never the purse
  // (kills already paid).
  const challengePct = challengeGoldBonusPct(state.challenge);
  const heatPct = goldMult(manualPushes(state)) - 1;
  // NIGHT MODE (owner 2026-09-17): the -50% rides the SAME additive pool —
  // total = 100% - NIGHT + CHALLENGE + HEAT, summed, never multiplied — and
  // the night term ALSO scales the per-run purse and the completion bonus,
  // because "start it at half gold" means the whole payout, not the flat
  // award the pool multiplies (the purse is the dominant income; halving
  // only the 70g award would be a ~0.01% cut). FIRST_CLEAR stays a separate
  // one-time record bonus, unhalved, like the challenge settle before it.
  const nightPct = state.nightRun ? RUN_GOLD.NIGHT_PENALTY_PCT : 0;
  const pool = 1 - nightPct / 100 + challengePct / 100 + heatPct;
  const nightFactor = 1 - nightPct / 100;
  const mult = (p.stats.goldMult || 1) * rampageGoldMult() * pool;
  const award = Math.round(RUN_GOLD.AWARD * mult) + (firstClear ? RUN_GOLD.FIRST_CLEAR : 0);
  const purseBanked = Math.round(purseClamp(profile.runPurse) * nightFactor);
  winBonus = Math.round(winBonus * nightFactor);
  const gold = award + purseBanked + winBonus;
  // F10 (audit round 3, 2026-09-16): CLAIM FIRST. The run-once flag used to be
  // written LAST, after every side effect — if anything threw in between
  // (bestTime write, banking, the achievements fold, the save), runSettled
  // stayed null and the NEXT ending settled a SECOND time: the exact S1
  // double-pay, re-opened by a partial failure. The claim now precedes the
  // effects, and the effects run inside try/catch so a partial failure can
  // neither re-open settlement nor kill the caller — it is reported and the
  // save is re-attempted once so the run does not strand silently. The return
  // value is the claim itself: byte-identical numbers on the normal path.
  state.runSettled = { gold, award, purseBanked, winBonus, firstClear,
    goldPool: { base: 1, night: nightPct / 100, challenge: challengePct / 100,
      heat: heatPct, total: pool } };
  // ONBOARDING (teach-until-demonstrated): the run ENDED — every hint that
  // never got its demonstration burns one of its 3 chances. Bumped beside the
  // claim (before the effects) so a partial settle failure cannot skip it.
  for (const id of HINT_IDS) if (!hintStore.done(id)) hintStore.bumpRuns(id);
  try {
    if (firstClear) profile.bestTime = Math.floor(state.time);
    profile.gold += gold;
    // THE DOUBLE-BANK TRAP: the purse MUST be zeroed as part of settlement, or
    // the next run's settlement banks the same remainder a second time.
    profile.runPurse = 0;
    state.runPurse = 0;
    // G9: fold the finished run into the profile (earn + grant) BEFORE the
    // save, so the trophies and the gold they were settled alongside persist
    // together.
    recordRunAchievements(gold);
    persistProfile();
  } catch (err) {
    console.error('settleRunGold: settlement claimed but an effect failed', err);
    try { persistProfile(); } catch { /* last-ditch save; nothing more to do */ }
  }
  return state.runSettled;
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
  const { gold, firstClear, award, purseBanked, goldPool } = settleRunGold({ winBonus: bonus });
  composeEndScreen({
    titleText: 'RUN SURVIVED',
    titleCls: 'logo',
    subHtml: endScreenBody({
      // The completion bonus rides the LEAD line (the content pass's one-
      // gold-line rule): it is already inside GOLD EARNED, named here so the
      // bigger number stays explained, and MAW SLAIN stays its own clause.
      lead: `the horde could not break you · lasted the full ${runClock(C.RUN.LIMIT)}` +
        ` · wave ${state.wave.num} · level ${p.level} · ${p.kills} kills` +
        ` · COMPLETION BONUS: +${bonus}${state.mawCleared ? ' · MAW SLAIN' : ''}`,
      cause: null,                // you did not die — you won
      gold, firstClear,
      parts: { award, purseBanked, winBonus: bonus, goldPool },
    }),
  });
  if (state.nightRun) nightRestartLeft = C.AUTOPILOT.NIGHT_RESTART_S;
}

// IN-RUN REFERENCE ACCESS supplement: every end screen (death, victory,
// deliberate END RUN) is composed HERE, and every one carries the HOW TO
// PLAY door — the two moments a player actually realises what they did not
// understand. The composed payload is stored on state so leaving (and
// returning) through the reference can recompose the IDENTICAL screen:
// reshowEndScreen re-renders the cards fresh and NEVER re-settles gold
// (settleRunGold ran exactly once, when the ending fired).
function composeEndScreen({ titleText, titleCls, subHtml }) {
  state.mode = 'dead';
  state.helpFrom = null;
  state.endScreen = { titleText, titleCls, subHtml };
  // MODAL SUPPRESSION (owner 2026-09-17, msg_01M2RVD9): the summary is the
  // ONLY text on screen. The whole canvas HUD — bars, feed, radar, banner —
  // is gated by the shared hudSuppressed('dead') predicate (render.js
  // HUD_SUPPRESSED_MODES), so nothing in the queue can PAINT behind the
  // summary. The queue itself is NOT purged here: the win funnel's trophy /
  // unlock announcements (settleRunGold) are the payload the test suite reads
  // and they harmlessly expire unpainted. The DEATH path purges for real at
  // the cine reveal (endDeathCine) — that is where a toast queued DURING the
  // movie (ttl frozen outside update()) could otherwise pop through.
  ovTitle.textContent = titleText;
  ovTitle.className = titleCls || '';
  // The G12 title screen HIDES the DOM h1 (the canvas title card owns it,
  // main.js showTitle) and only openMenu restores it — every run launched
  // from the title flow composed its summary with an invisible 'THE HORDE
  // WINS' header (caught on the 2026-09-17 summary screenshots). Same
  // restore idiom as openMenu.
  if (ovTitle.style) ovTitle.style.display = '';
  ovSub.innerHTML = subHtml;
  ovCards.innerHTML = '';
  menuCard('RETRY', 'straight back in [R]', () => startRun());
  menuCard('TITLE', 'spend your gold [T]', () => showTitle());
  menuCard('HOW TO PLAY', 'what every control &amp; object does', () => showHowToPlay({ fromEnd: true }));
  // 'end': the summary's own panel styling (index.html) — spacing, hierarchy
  // and the dim scrim over the frozen arena. Removed everywhere else a menu
  // composes (showTitle/showHowToPlay paths reset the overlay class).
  if (overlay.classList) { overlay.classList.add('end'); }
  overlay.style.display = 'flex';
}
function reshowEndScreen() {
  if (!state.endScreen) { showTitle(); return; }   // nothing to return to
  composeEndScreen(state.endScreen);
  maybeDeathCoach();      // idempotent (once-ever flag) — parity with the direct paths
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
    persistProfile();
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
  const { gold, firstClear, award, purseBanked, goldPool } = settleRunGold();
  composeEndScreen({
    titleText: 'RUN ENDED',
    titleCls: '',
    subHtml: endScreenBody({
      lead: `you called it at wave ${state.wave.num} · survived ${Math.floor(state.time)}s` +
        ` (${runClock(state.time)} / ${runClock(C.RUN.LIMIT)}) · level ${p.level} · ${p.kills} kills`,
      cause: null,          // a deliberate exit has no killer
      gold, firstClear,
      parts: { award, purseBanked, winBonus: 0, goldPool },
    }),
  });
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
  state.mode = 'death-cine';   // G15: the death movie owns the beat between
  // here and the payoff screen — die() still composes the overlay BELOW, the
  // cine merely delays its reveal (and never touches what it says).
  state.deathBy = {
    ...(lastDamageSource || { cause: 'unknown' }),
    wave: state.wave.num,
    time: state.time,
  };
  audio.stopMusic();
  audio.playSfx('death');
  const { gold, firstClear, award, purseBanked, goldPool } = settleRunGold();

  // WAVE-10: dying to the maw gets its own dramatic card (same payout).
  composeEndScreen({
    titleText: finale ? 'THE HORDE CLAIMS ALL' : 'THE HORDE WINS',
    titleCls: finale ? 'logo' : '',
    subHtml: endScreenBody({
      lead: (finale ? 'the maw swallowed the last hero<br>' : '') +
        `WAVE ${state.wave.num} · survived ${Math.floor(state.time)}s` +
        ` (${runClock(state.time)} / ${runClock(C.RUN.LIMIT)}) · level ${p.level} · ${p.kills} kills`,
      cause: deathCauseLabel(state.deathBy),
      gold, firstClear,
      parts: { award, purseBanked, winBonus: 0, goldPool },
    }),
  });
  // NIGHT MODE: the auto-RETRY (a deliberate END RUN never arms it — a human
  // pressed that button).
  if (state.nightRun) nightRestartLeft = C.AUTOPILOT.NIGHT_RESTART_S;
  // G15 THE DEATH MOVIE: the payoff above is COMPOSED but stays HIDDEN while
  // the movie plays; endDeathCine() reveals it untouched. Gold was settled
  // exactly once above (settleRunGold) — the cine never pays, never re-stamps
  // deathBy, and never recomposes the card.
  overlay.style.display = 'none';
  startDeathCine();
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
// STARTING ARENA IMPROVE (2026-09-17): the card now carries the MEASURED
// table (stageFactsLine — ranged/heavy share, foe hp/dmg/spawn, hazard,
// relief) computed from the same catalog the spawner reads, so what the
// card promises is what the run does. setupCard's split(' · ')[0] below
// still gets the stage NAME.
function stageCardSub() {
  const locked = lockedStageLines(stageUnlocked);
  const head = locked.slice(0, 2).join(', ');
  const more = locked.length > 2 ? ' +' + (locked.length - 2) + ' more' : '';
  return describeStage(pendingStage) + ' · press to change' +
    '<br>' + stageFactsLine(pendingStage) +
    (locked.length ? '<br>locked: ' + head + more : '');
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

// ---------- THE MANUAL v2 (owner 2026-09-16, msg_01M2P2714VDKY07BBWWCX3G7CC) ----
// The single-screen reference is PAGINATED: four pages (HOW A RUN WORKS /
// OPTIONS AND MODES / CONTROLS / THE FIELD), a page indicator, PREV/NEXT
// cards with arrow-key parity, a CONTENTS row that jumps, and GOT IT as a
// FLOW footer (never sticky over the body). The separate TOUCH and KEYBOARD
// cards are RETIRED — one CONTROLS page with subheads, the player's OWN
// input path first (touch device -> touch first; desktop -> keys first).
// Live callouts read state at OPEN time. The old single screen put three
// ref cards in one column: on a portrait phone the column outran the fold
// and the cards clipped (owner: "the card doesn't show on the screen").
const MANUAL_PAGES = 4;
const MANUAL_TITLES = ['HOW A RUN WORKS', 'OPTIONS AND MODES', 'CONTROLS', 'THE FIELD'];
// Rows are TWO COLUMNS: purpose left (wraps), trigger right (nowrap — a
// key or button name never splits mid-token). The canonical control rows
// are BUILT FROM controls_ref (one source of truth, no forked strings);
// the composite lines below carry copy other suites pin verbatim, so they
// ride whole in a single-cell row.
const refRow = (label, value, wrap) =>
  '<div class="rr"><span class="rl">' + label + '</span>' +
  (value === undefined ? '' : '<span class="rv' + (wrap ? ' wrap' : '') + '">' + value + '</span>') + '</div>';
// Subheads inside the ONE CONTROLS card. 'KEYBOARD CONTROLS' / 'TOUCH
// CONTROLS' — never the bare word, so no markup can read '>TOUCH<' (that
// token is how the retired two-card layout is detected and kept out).
const refSub = (t) => '<div class="subhead">' + t + '</div>';

function manualRowsControls() {
  // ONE CARD, NOT TWO: both input schemes, the player's OWN path first.
  // ULT MANA (2026-09-17): when the live class's Q is an ULT, its row states
  // the charge AND the mana price — built from the config at render time so
  // the copy can never drift from what useSkill charges.
  const qDef = C.SKILLS[classSkillId(state)] || {};
  const qPurpose = qDef.KILLS != null
    ? 'unleash your class ULT (' + qDef.KILLS + ' kills charged + ' + (qDef.MANA || 0) + ' mana)'
    : null;
  const kbRows =
    // M1 mechanical fix: O is the pilot toggle (M was taken by the map) —
    // the tour tip and the key handler already say O; the row says it too.
    CONTROLS
      .filter(c => !['potion-hp', 'potion-mp', 'stats'].includes(c.id))
      .map(c => refRow(c.id === 'skill-q' && qPurpose ? qPurpose : c.purpose, c.keys.join(' / ')))
      .join('') +
    refRow('move', 'arrows / WASD') +
    refRow('H / N — potions &middot; I — field report (the ONE stats key)') +
    refRow('1 – 3 — draft cards (1 – 4 in evolve / intermission) &middot; 1 – 6 — stat tabs') +
    refRow('C — continue &middot; R / T — retry / title') +
    refRow('+ / - — zoom &middot; mouse — the cog (top-right) opens settings') +
    refRow('ESC or P — pause in a run (the same screen as the cog) &middot; ESC — close menus') +
    // '?' SUPPLEMENT: built FROM the controls_ref row — the card can never
    // drift from the hint that names the glyph.
    refRow('? — ' + controlById('help').purpose) +
    // RETIRED '?' PANEL (2026-09-16): the compact four-line key list lives
    // HERE now — the SAME HINT_LINES table the panel read, so nobody loses
    // the list; it stops being the whole of "?".
    compactKeyLines().map(l => refRow(l)).join('');
  const tchRows =
    refRow('move (manual pilot)', 'joystick') +
    refRow('volley target: NEAREST / TOUGHEST / SWARM / RANGED', 'FOCUS') +
    refRow('risk dial: SAFE / BALANCED / GREEDY', 'STANCE') +
    refRow('auto &harr; manual', 'PILOT') +
    refRow('your build &amp; gear', 'STATS') +
    refRow('skills', 'FROST / OVER') +
    // RSS8: the card-granted sweep, named so the touch layer's MAG button can
    // never outrun the reference (the button only exists with the card).
    refRow('magnet sweep: every drop flies to you (the Magnet Collector card\u2019s skill, 30s cooldown)', 'MAG') +
    // IN-RUN REFERENCE ACCESS + POTION ICONS (owner 2026-09-16: the rows must
    // use the word "potion" and say what each one restores — one row each, the
    // key named, so both name sets stay one-glyph-one-meaning) ...
    refRow('health potion — restores a carried charge: +' + C.POTIONS.HP_HEAL + ' HP', 'H') +
    refRow('mana potion — restores a carried charge: +' + C.POTIONS.MP_RESTORE + ' MP', 'N') +
    // ... and every authored cog-row button is named here, so the canonical
    // list (test_ref_access, harvested from the touch layer's own buttons)
    // can never silently outrun the reference.
    refRow('help mode: tap any control or object to learn it', 'HELP') +
    refRow('edge blips mark enemies off-screen', 'RADAR') +
    refRow('the world map (fight keeps running)', 'MAP') +
    refRow('settings: zoom, END RUN', 'SETTINGS (cog)') +
    // P2B99: THE ESCAPE's manual pads, named (the how-to card must carry the
    // controls a manual player presses — the pads mirror the auto-pilot's
    // whole action set: hold LEFT/RIGHT to run, LIFT to brake, plus the verbs).
    refSub('THE ESCAPE (manual)') +
    refRow('hold to run &middot; LIFT to brake (that is how you time the boss arms)', '\u25C0 / \u25B6') +
    refRow('leap the gaps (same jump as the auto pilot)', 'JUMP') +
    refRow('the short speed burst', 'DASH') +
    refRow('stomp the pursuit pack off your tail (cooldown)', 'KICK') +
    refRow('switch pilot &harr; manual mid-escape (same O setting)', 'MODE') +
    refRow('keys work too: A/D move &middot; SPACE jump &middot; X dash &middot; S kick &middot; O mode', 'KEYS');
  return isTouchPath()
    ? refSub('TOUCH CONTROLS') + tchRows + refSub('KEYBOARD CONTROLS') + kbRows
    : refSub('KEYBOARD CONTROLS') + kbRows + refSub('TOUCH CONTROLS') + tchRows;
}

// Draw one page. Re-entrant: every page turn rebuilds the card stack (the
// indicator, the nav row, the contents row and the GOT IT footer with it).
function manualGoto(page) {
  const p = Math.max(1, Math.min(MANUAL_PAGES, page));
  state.manualPage = p;
  ovCards.innerHTML = '';
  // HOW TO PLAY readability (owner 2026-09-16): the reference is a DOCUMENT,
  // not a tip — this screen alone carries the .howto wide-panel modifier
  // (index.html sizes it: width 100% capped 560px, 15px body, internal
  // scroll). openMenu cleared it; every page re-adds it.
  if (overlay.classList) overlay.classList.add('howto');
  else if (overlay.className) overlay.className = (overlay.className ? overlay.className + ' ' : '') + 'howto';
  ovTitle.textContent = 'HOW TO PLAY';
  ovTitle.className = '';
  ovSub.innerHTML = p === 1
    // The one-line point of the game leads the FIRST page (the first-run
    // gate opens here), with the replay-tour pointer (complaint 3: the
    // replay path existed but nobody found it).
    ? 'SURVIVE THE WAVES. your pilot auto-fights —<br>' +
      'you steer the BUILD: draft weapons, bank gold, outlast the finale.' +
      '<br>Missed the guided tour? The REPLAY TOUR card at the bottom runs it again.' +
      '<br>PAGE 1 / ' + MANUAL_PAGES + ' — ' + MANUAL_TITLES[0]
    : 'PAGE ' + p + ' / ' + MANUAL_PAGES + ' — ' + MANUAL_TITLES[p - 1];
  const addCls = (el, c) => {
    if (el.classList) el.classList.add(c);
    else el.className = (el.className ? el.className + ' ' : '') + c;
  };
  if (p === 1) {
    // HOW A RUN WORKS: waves and what ends one, the intermission, what the
    // choices do, both endings — dense, numbers where they exist.
    const c = menuCard('HOW A RUN WORKS',
      'every wave: 120s of horde (a mid-boss rings you at half-time),<br>' +
      'then the wave BOSS spawns — slay it and the PORTAL opens; walk in.<br><br>' +
      'INTERMISSION (between waves): paid chests (40/25/10% nothing),<br>' +
      'blessings, RAISE THE STAKES (+1 heat = +30% run gold per push, capped)<br>' +
      '&middot; evolve tokens turn weapons maxed at Lv 8 into something new.<br><br>' +
      'the field, mid-wave: DRAFT / upgrade picks on level-up &middot; SHRINE<br>' +
      'altars sell blessings for run gold &middot; ARCH gates grant a timed buff &middot;<br>' +
      'CHEST boxes gamble items (walk in, take the roll).<br><br>' +
      'CHALLENGE (title-screen card): rule-constrained runs (ONE WEAPON /<br>' +
      'NO POTIONS); the HUD names the live mode.<br><br>' +
      'a run ends two ways: DEATH — the horde claims all, gold banked —<br>' +
      'or VICTORY: outlast all five waves and slay THE MAW OF THE HORDE.');
    addCls(c, 'ref');
  } else if (p === 2) {
    // OPTIONS AND MODES: one plain line each + the LIVE callout row read
    // from state at OPEN time (never bitmaps, never stale defaults).
    const c = menuCard('OPTIONS AND MODES',
      refRow('AUTO: the pilot plays &middot; MANUAL: the stick / keys are yours', 'PILOT (O)') +
      refRow('volley target: NEAREST / TOUGHEST / SWARM / RANGED', 'FOCUS (TAB)') +
      refRow('risk dial: SAFE / BALANCED / GREEDY', 'STANCE (G)') +
      refRow('yours right now', state.pilotMode + ' &middot; ' + controller.focus + ' &middot; ' + controller.stance, true) +
      '<div class="rl">every lever is on the touch pads too — and in help mode (?),<br>' +
      'a tap on any control explains it.</div>');
    addCls(c, 'ref');
  } else if (p === 3) {
    // ONE CARD, NOT TWO: the merged controls page (see manualRowsControls).
    const c = menuCard('YOUR CONTROLS', manualRowsControls());
    addCls(c, 'ref');
  } else {
    // WAVE-22: the field itself — the exhaustive reference for everything
    // that isn't a button or a key. HELP MODE: the object rows render from
    // OBJECT_HELP — the SAME table the inspect mode's world-space picks
    // explain from, so the two surfaces cannot drift.
    const c = menuCard('THE FIELD',
      OBJECT_HELP.filter(o => o.field).map(o => o.field).join('<br>') +
      // PLAYER REVIEW 2026-09-17 item 3: potions get their own block — the
      // review's "not clear how they work". Every number here is the code's
      // own (config.js POTIONS + AUTOPILOT.AUTO_DRINK; the boss curse is
      // main.js drinkHealthPotion's state.wave.boss halving), pinned by
      // test_review_round1 item 3 so the copy cannot drift from the config.
      '<br><br>POTIONS — carried charges, not skills:' +
      '<br>enemies drop them (' + (C.POTIONS.DROP_CHANCE * 100).toFixed(1) + '% per kill;' +
      ' rarer in dense swarms) — picked up automatically in pickup range,' +
      ' LEFT ON THE GROUND at your cap (' + C.POTIONS.MAX_CARRIED + ' of each).' +
      '<br>a run starts with ' + C.POTIONS.START + ' of each; Travel Pack (shop) adds more.' +
      '<br>HEALTH potion: +' + C.POTIONS.HP_HEAL + ' HP &middot; MANA potion: +' + C.POTIONS.MP_RESTORE + ' MP' +
      ' &middot; never spent at full.' +
      '<br>AUTO pilot drinks for you: HP under a potion\'s heal (' + C.POTIONS.HP_HEAL + ' + bonuses)' +
      ', MP under ' + Math.round(C.AUTOPILOT.AUTO_DRINK.MP_FRACTION * 100) + '% of max.' +
      '<br>boss curse: while the wave boss lives, health potions heal HALF.' +
      // STARTING ARENA IMPROVE (2026-09-17): the arena itself explained —
      // the review's "what things are" gap for the starting field. The
      // claims are the code's own: BASIN flat heart (relief.js), GROVE/GATE/
      // STUMP landmarks (render.js), grade + vision (relief.js knobs).
      '<br><br>THE LIE OF THE LAND — the hollow reads as a map:' +
      '<br>the OLD STUMP marks the arena heart — your flat spawn clearing; twin GATE stones mark each compass wall.' +
      '<br>the ground rises toward the rim: climbing costs a little speed (foes pay it too), high ground widens your radar reach.');
    addCls(c, 'ref');
  }
  // Nav row (HOW-TO-PLAY SETTLED SHAPE, owner 2026-09-18: the index buttons
  // are GONE — "just removing the supposed index buttons and keeping prev and
  // next and making sure they are underneath the instructions"): PREV/NEXT
  // stay, as SMALL side-by-side buttons (the .nav class, index.html) directly
  // UNDER the instructions card, so the manual TEXT dominates the screen. The
  // ends dim; arrow keys are their twins; the PAGE n / N subtitle is the
  // position marker.
  const cPrev = menuCard('PREV', 'page ' + Math.max(1, p - 1), () => manualGoto(p - 1), p <= 1);
  addCls(cPrev, 'nav');
  const cNext = menuCard('NEXT', 'page ' + Math.min(MANUAL_PAGES, p + 1), () => manualGoto(p + 1), p >= MANUAL_PAGES);
  addCls(cNext, 'nav');
  // M4: REPLAY TOUR (WAVE-21, docs/FIRST_RUN_TOUR doc #7) lives HERE now — a
  // footer card on every manual page EXCEPT the first-run gate (a fresh
  // player has not seen the tour yet; replaying it from the gate would be a
  // trap). Behavior unchanged from the old settings card: re-arm the
  // demonstration flags AND the give-up counters, lift a skip's session
  // suppression, then return exactly where GOT IT would.
  if (state.helpFrom !== 'gate') {
    menuCard('REPLAY TOUR', 'run the guided walkthrough again', () => {
      clearTourFlags();
      // ONBOARDING REWORK: the replay re-arms the hint layer as well — the
      // demonstration flags AND the give-up counters (onboarding.js reset()).
      hintStore.reset();
      // ...and lifts a skip's session suppression (PLAYER REVIEW item 1: the
      // player who asks for the tour back gets the chips back too).
      hintsSuppressed = false;
      const back = state.helpFrom;
      state.manualPage = null;
      state.helpFrom = null;
      if (back === 'run') {
        closeSettings();
        toast('TOUR REPLAYS NOW');   // the kept cards + hints re-arm live
      } else if (back === 'end') {
        reshowEndScreen();
      } else {
        showTitle();                 // the kept cards re-arm on their screens
      }
    });
  }
  // GOT IT: a FLOW footer card at the end of the stack — in the layout,
  // never sticky over the scrolling body.
  const gotSub = state.helpFrom === 'gate' ? 'into the horde (shows once)'
    : state.helpFrom === 'run' ? 'back to the fight'
    : state.helpFrom === 'end' ? 'back to this screen'
    : 'back to the title';
  const cGot = menuCard('GOT IT', gotSub, () => {
    completeOnboarding();
    state.manualPage = null;
    // UP-FRONT CONTROLS: opened as the FIRST-RUN GATE (fresh START GAME),
    // GOT IT starts the run (no title-art hold here — the hold belongs to
    // the title screen, and the gate's job is to get the briefed player
    // into the horde).
    // IN-RUN REFERENCE ACCESS: every door returns to where it was opened —
    // the in-run door resumes the FIGHT (closeSettings: the same close/
    // return discipline as BACK), the end screens recompose the SAME end
    // card (reshowEndScreen: never re-settles gold, never restarts), the
    // title door returns there.
    const back = state.helpFrom;
    state.helpFrom = null;
    if (back === 'gate') startRun();
    else if (back === 'run') closeSettings();
    else if (back === 'end') reshowEndScreen();
    else showTitle();
  });
  addCls(cGot, 'gotit');
}
function manualPrev() { if (state.manualPage && state.manualPage > 1) manualGoto(state.manualPage - 1); }
function manualNext() { if (state.manualPage && state.manualPage < MANUAL_PAGES) manualGoto(state.manualPage + 1); }

function showHowToPlay({ intoRun = false, inRun = false, fromEnd = false } = {}) {
  // IN-RUN REFERENCE ACCESS (owner 2026-09-16): the reference is reachable
  // mid-run (the in-run SETTINGS door, under the 'settings' pause mode so
  // ESC and GOT IT resume the fight through closeSettings) and from the end
  // screens (fromEnd — GOT IT recomposes the SAME end card, never re-settling
  // gold). state.helpFrom remembers the door GOT IT walks back out of.
  state.helpFrom = intoRun ? 'gate' : inRun ? 'run' : fromEnd ? 'end' : 'title';
  openMenu(inRun ? 'settings' : 'menu');
  manualGoto(1);
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
// SHOP-LATENCY FIX (owner 2026-09-15: "~2 second delay in the shop"): the old
// path called renderer.drawGrid PER CARD on a ~9,400-non-zero-cell composed
// frame, so a 47-row shop open painted ~440k fillRects and read clientWidth
// after every append (a forced relayout per row). Two changes, same pixels:
//   ATLAS - each distinct (w x h x tone) frame is composed and drawn through
//   the SAME renderer.drawGrid ONCE into an offscreen canvas, then blitted
//   onto the card's canvas with one drawImage (menus share 2-3 card sizes, so
//   a 47-row screen paints ~3 frames, not 47). The atlas is the drawGrid
//   seam's cache, never a second painting idiom.
//   BATCHED PAINT - showShop appends the whole card list BEFORE any frame
//   measures (menuCard's deferFrame option), so one layout serves all rows
//   instead of a forced relayout per append; paint itself stays synchronous.
const frameAtlas = new Map();
function frameBlit(cv, wpx, hpx, tone) {
  const W = wpx + MENU_FRAME_SHADOW.dx, H = hpx + MENU_FRAME_SHADOW.dy;
  const key = W + 'x' + H + ':' + tone;
  let src = frameAtlas.get(key);
  if (!src) {
    src = document.createElement('canvas');
    src.width = W; src.height = H;
    const sg = src.getContext && src.getContext('2d');
    if (!sg) return false;   // stub DOM without 2d: markup only, as before
    renderer.drawGrid(sg, composeMenuFrame(wpx, hpx).grid, MENU_FRAME_PALETTES[tone], 0, 0);
    frameAtlas.set(key, src);
  }
  cv.width = W; cv.height = H;
  const g = cv.getContext && cv.getContext('2d');
  if (!g) return true;        // stub canvas: the child element stays the contract
  if (g.drawImage) g.drawImage(src, 0, 0);
  else renderer.drawGrid(g, composeMenuFrame(wpx, hpx).grid, MENU_FRAME_PALETTES[tone], 0, 0);
  return true;
}
function frameCard(el, lazy = false) {
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
    const cls = el.className || '';
    const tone = cls.includes('selected') ? 'sel'
      : (frameHotEl === el && !cls.includes('dim')) ? 'hot' : 'base';
    return frameBlit(cv, Math.round(w), Math.round(h), tone);
  };
  // Late relayout (a menu re-wrap, a viewport change, a state line settling)
  // re-measures and repaints — the frame always matches the card's live box.
  // SHOP-LATENCY `lazy`: skip the sync paint and let the OBSERVER deliver the
  // first paint after the browser's own layout pass (RO fires on observe) —
  // no forced reflow, and the initial observation IS the first paint. Stub
  // DOMs have no ResizeObserver: lazy there simply means markup-only, which
  // is exactly what the stub contract already was.
  if (typeof ResizeObserver === 'function' && !el._frameRO) {
    el._frameRO = new ResizeObserver(() => { paint(); });
    el._frameRO.observe(el);
    if (lazy) return wireFrameEvents(el, paint);
  }
  if (!paint()) {
    let tries = 0;
    const retry = () => { if (!paint() && ++tries < 8) requestAnimationFrame(retry); };
    requestAnimationFrame(retry);
  }
  wireFrameEvents(el, paint);
  return el;
}
function wireFrameEvents(el, paint) {
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

function menuCard(name, sub, onclick, dim, deferFrame = false) {
  const el = document.createElement('div');
  el.className = 'card' + (dim ? ' dim' : '');
  el.innerHTML = `<div class="name">${name}</div><div class="desc">${sub || ''}</div>`;
  el.onclick = () => {
    // HELP MODE: an overlay-card tap explains the card, never presses it.
    if (state.helpMode) { showHelpTip('<b>' + name + '</b> — ' + (sub || ''), el); return; }
    audio.playSfx('button'); onclick();
  };
  ovCards.appendChild(el);
  // SHOP-LATENCY: big screens pass deferFrame and frame the whole list AFTER
  // the appends (one layout serves every row - see frameCard's atlas note).
  if (!deferFrame) frameCard(el);
  return el;
}

function openMenu(mode = 'menu') {
  // Common frame for every meta screen; caller fills ovCards. WAVE-17: the
  // in-run SETTINGS screen passes its own pause mode ('settings') so the
  // frame loop keeps NOT ticking — identical pause contract to 'stats'.
  // DRAFT PICK CEREMONY: any meta screen supersedes a live ceremony — it
  // stands down without touching what this screen is about to draw.
  if (draftCeremony) endDraftCeremony(false);
  state.mode = mode;
  // MANUAL v2: pagination is manual-scoped — every other screen (and every
  // re-open of a non-manual menu) starts with the page marker cleared, so
  // the arrow keys can never turn a page of a screen that is not there.
  state.manualPage = null;
  // HOW TO PLAY readability: the .howto wide-panel modifier belongs to that
  // screen alone — reset it HERE so no other menu can inherit the wide rows.
  // (class-list-less DOM stubs keep a plain className string — same state.)
  // 'end' (the end-of-run summary's panel styling) gets the same reset — no
  // menu may inherit the summary's spacing/scrim.
  if (overlay.classList) overlay.classList.remove('howto', 'end');
  else if (overlay.className) overlay.className = overlay.className.split(/\s+/).filter(c => c !== 'howto' && c !== 'end').join(' ');
  overlay.style.display = 'flex';
  ovCards.innerHTML = '';
  ovCards.style.flexWrap = 'wrap';
  ovCards.style.justifyContent = 'center';
  // SHOP PAGING: the pager chrome + grid mode are shop-scoped — every menu
  // open starts clean (and a later showShop re-applies them itself).
  clearShopPager();
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

// ---------- FIRST-RUN TOUR — the KEPT cards (onboarding rework 2026-09-16) --
// The staged walkthrough lost its stage 1 (title cards) and its in-run
// schedule to the owner-approved onboarding rework: every labelled button and
// every timer-scheduled card was "information without context". What remains
// are the four KEPT cards — draft (level-up), death, loadout, first-cog END
// RUN — each on a screen that already freezes the sim by MODE, plus the
// non-pausing hint/tag layer in src/onboarding.js (see updateOnboarding).
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

let coach = null;
function coachActive() { return !!(coach && coach.active()); }

// ---------- ONBOARDING REWORK (owner-approved 2026-09-16) ----------------------
// The 25-card tour is retired. What remains: the KEPT cards (draft at level-up,
// death, loadout, first-cog END RUN — all on screens that already freeze the
// sim by mode), the 3 IN-CONTEXT touches below, and the OBJECT TAGS. The
// players' words this answers: "tons of information thrown at you without
// context", "I must've skipped like 8 tutorial blurbs because I was moving
// manually". The hint engine (src/onboarding.js) NEVER pauses the sim and
// NEVER captures input — there is no shade, no swallow-all handler, no
// NEXT/BACK/SKIP: nothing to dismiss, so nothing can be closed by accident.
const hintStore = makeHintStore(prefStorage);
const onboardingAnchor = () => {
  const wrap = document.getElementById('wrap');
  return (wrap && typeof wrap.getBoundingClientRect === 'function')
    ? wrap.getBoundingClientRect() : { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 };
};
// The strip keeps clear of the joystick and the touch buttons (invariant 5).
// UP-FRONT CONTROLS: the named cog row (SETTINGS / HELP / RADAR / MAP) is
// wider than the old glyphs — all four buttons are avoid rects now.
const ONBOARDING_AVOID_IDS = ['joy', 'tc-focus', 'tc-stance', 'tc-pilot', 'tc-stats', 'tc-q', 'tc-w', 'tc-h', 'tc-n', 'tc-cog', 'tc-help', 'tc-radar', 'tc-map', 'tc-magnet'];
const onboardingAvoid = () => {
  const rects = ONBOARDING_AVOID_IDS
    .map(id => document.getElementById(id))
    .filter(el => el && typeof el.getBoundingClientRect === 'function')
    .map(el => el.getBoundingClientRect())
    .filter(r => r && (r.width > 0 || r.height > 0));
  // MANUAL v2 (owner 2026-09-16, portrait phone: the hint card "overlaps HUD
  // bars (HP/MP/XP/GOLD)"): the canvas HUD readout block — native
  // (0,0)-(200,52): HP/MP labels+bars+values (render.js drawHud: label x=6,
  // bars to x=132, value plates past x=136, y 11..33) and the XP bar
  // (y 35..45) — projected to screen coords. The strip's top-centre
  // candidate used to sit right on the bars.
  try {
    const r = canvasRegion(0, 0, 200, 52).getBoundingClientRect();
    if (r && Number.isFinite(r.left) && (r.width > 0 || r.height > 0)) rects.push(r);
  } catch { /* headless stub canvas has no rect: no avoid, no crash */ }
  return rects;
};
const hintStrip = new HintStrip({ anchor: onboardingAnchor, avoid: onboardingAvoid });
// OBJECT LABELS REMOVED (owner 2026-09-16: "The on screen labels for arch and
// shrine are a bit annoying, and sometimes they persist after the run"): the
// ObjectTags layer — chest / portal / arch / shrine floating labels, their
// edge arrows, fade timers and per-run seen-state — is deleted outright, not
// flagged off. The persistence fault was real: tags only ticked in 'playing'
// and only cleared at startRun, so a label mounted near a run's end SURVIVED
// death, RUN SURVIVED and RETURN TO TITLE. Object knowledge lives in THE
// FIELD reference page now (single teaching surface). Pinned by
// test/test_notags.mjs.
//
// Run-scoped onboarding state (reset in startRun; NOT state.* — nothing here
// needs to survive the run, and the state-reset guard stays untouched).
let hintShownRun = {};   // hint id -> already shown this run (max once per run)
let hintMoveTime = 0;    // seconds of demonstrated movement this run
let hintPrevPos = null;  // last player position, for the displacement test

// PER-CONTROL INTRODUCTIONS (owner 2026-09-16: "It's the per button cards.
// We don't have to have cards, really, but at least something that shows
// people how to use them.") — every control names itself at the FIRST moment
// it matters. The retired timer-scheduled cards fired on a CLOCK regardless
// of context and PAUSED the sim; both failure modes stay dead: triggers here
// are EVENTS (hp actually dropped, skill actually ready, draft actually
// opened...), and the scheduler paces them — at most one hint per
// HINT_SPACING_S of play, never during a boss fight, never stacked (the
// strip's own one-at-a-time queue serializes what slips past).
const HINT_SPACING_S = 20;
let hintPending = [];          // armed ids waiting on the spacing / boss gate
let hintLastShownAt = -1e9;    // state.time of the last hint DISPLAY
let introSawDraft = false;     // a level-up draft opened this run
let introSawIntermission = false;   // an intermission was reached this run
// PLAYER REVIEW 2026-09-17 item 1 ("clicking 'skip' still shows you the next
// chips"): skipping a tour ENDS the tutorial sequence. Session-scoped (never
// persisted — a reload is a fresh chance to teach); deliberately NOT reset by
// resetOnboarding, so the suppression survives run starts and title returns.
// REPLAY TOUR is the only way back in.
let hintsSuppressed = false;

function resetOnboarding() {
  hintShownRun = {}; hintMoveTime = 0; hintPrevPos = null;
  hintPending = []; hintLastShownAt = -1e9;
  introSawDraft = false; introSawIntermission = false;
  hintStrip.clear();
}

// ARM a hint: its moment arrived, but display is the scheduler's call. Once
// per run (deduped here), teach-until-demonstrated + give-up in the store.
function maybeHint(id, trigger, text) {
  if (!trigger) return;
  if (hintsSuppressed) return;   // a skipped tutorial never chips again
  if (hintShownRun[id] || hintPending.some(h => h.id === id)) return;
  if (hintStore.done(id) || hintStore.runs(id) >= 3) return;
  hintPending.push({ id, text });
}

// A boss fight is the wrong teacher — the player has enough to read there.
// Hints wait it out (the pending list drains when the cast is down).
function bossFightLive() {
  return !!(
    (state.wave.bosses && state.wave.bosses.some(b => b && b.hp > 0)) ||
    (state.wave.midBosses && state.wave.midBosses.some(b => b && b.hp > 0)) ||
    (state.finalBoss && state.finalBoss.hp > 0));
}

// The scheduler: one hint at a time, >= HINT_SPACING_S apart, never during a
// boss fight. Entries demonstrated while waiting are dropped silently.
function pumpHints() {
  if (hintStrip.visibleId !== null) return;
  if (state.time - hintLastShownAt < HINT_SPACING_S) return;
  if (bossFightLive()) return;
  while (hintPending.length) {
    const h = hintPending.shift();
    if (hintStore.done(h.id)) continue;
    hintShownRun[h.id] = true;
    hintLastShownAt = state.time;
    hintStrip.show(h.id, h.text);
    break;
  }
}

// The touch path names the TOUCH control — a phone player is never told to
// press a key they do not have. Read live off the touch layer's own class
// (set at boot from hasTouch), so tests can flip it through the DOM.
function isTouchPath() {
  return !!(touchLayer && touchLayer.classList && touchLayer.classList.contains('on'));
}

// DEMONSTRATION: the player just used this control — the introduction has
// done its job. Retires the store flag forever and pulls any live instance.
function controlUsed(id) {
  if (!HINT_IDS.includes(id)) return;
  if (!hintStore.done(id)) hintStore.setDone(id);
  hintStrip.retire(id);
  hintPending = hintPending.filter(h => h.id !== id);
}

// Object tags (first-sighting labels) were REMOVED with the layer — see the
// note above the run-scoped state: no sources, no arming call, no engine
// instance. updateOnboarding below cannot arm a label, and test_notags.mjs
// pins exactly that (symbol absence in the shipped source).

// Runs every PLAYING frame — after update(), banner or not. It can never gate
// the sim (invariant 1) and never sees an input event (invariant 2).
function updateOnboarding(dt) {
  const p = state.player;
  // FIRST-RUN PROLOGUE: the prologue banners OWN the intro — no hint arms or
  // shows during the phase (the strip still ticks so a fade finishes). The
  // HintStrip resumes the moment the phase ends; nothing is retired.
  if (state.prologue) { hintStrip.update(dt); return; }
  // (a) RUN START: movement, one line. Replaces the move + pilot + hud cards.
  // DEVICE (2026-09-16): device-derived — a touch-path player is told to
  // drag, never taught a key they do not have (the line used to say "WASD
  // or drag" on every device).
  maybeHint('move', state.time > 0.75,
    isTouchPath()
      ? 'drag to move — your weapons fire on their own.'
      : 'WASD or drag to move — your weapons fire on their own.');
  // (b) FIRST PORTAL: bank the wave. Replaces the portal card.
  maybeHint('portal', !!state.portal,
    'Walk through the portal to bank the wave.');
  // (c) PER-CONTROL INTRODUCTIONS: every control names itself at the FIRST
  // moment it matters — an EVENT, never a clock. The texts come from
  // src/controls_ref.js (the same rows the reference screens read — no
  // forked strings) and name the TOUCH control on a touch path. The 2s
  // grace keeps the RUN-START move line the first thing anyone reads —
  // skills are ready and enemies seeded at t=0, and without it a per-control
  // line would win the first display slot before the move hint's t>0.75.
  if (state.time > 2) {
    const touch = isTouchPath();
    const qid = classSkillId(state);
    const qDef = C.SKILLS[qid] || {};
    const uq = ultCharge(state, qid);
    const qReady = uq ? uq.ready
      : ((p.skillCd[qid] || 0) <= 0 && p.mana >= skillManaCost(qid, state));
    // ULT MANA (2026-09-17): the Q hint states the ult's charge AND price
    // (same words as the manual's row — controls_ref is the base, this is the
    // live-class override).
    const qIntroPurpose = qDef.KILLS != null
      ? 'unleash your class ULT (' + qDef.KILLS + ' kills charged + ' + (qDef.MANA || 0) + ' mana)'
      : null;
    const wReady = (p.skillCd.OVERCHARGE || 0) <= 0 &&
      p.mana >= skillManaCost('OVERCHARGE', state);
    const inCombat = state.enemies.some(e => e && e.hp > 0);
    // Skills matter the first time one is READY with a live enemy to spend
    // it on; potions the first time the resource is actually down.
    maybeHint('skill-q', inCombat && qReady,
      introLine('skill-q', touch, {
        keys: [String(qDef.KEY || 'q').toUpperCase()],
        touch: String(qDef.NAME || 'skill').toUpperCase(),
        ...(qIntroPurpose ? { purpose: qIntroPurpose } : {}),
      }));
    maybeHint('skill-w', inCombat && wReady, introLine('skill-w', touch));
    // RSS8 MAGNET COLLECTOR: a CARD-granted control — it can only matter once
    // the run drafted the mythic, and the first moment it matters is the first
    // time there is actually something on the floor to sweep. Runs without the
    // card never arm it (the control does not exist for them).
    maybeHint('skill-magnet',
      magnetHeld(state) &&
      (state.gems.length + state.drops.length + state.itemDrops.length) > 0,
      introLine('skill-magnet', touch));
    maybeHint('potion-hp', p.potions.hp > 0 && p.hp < p.stats.maxHp * 0.85,
      introLine('potion-hp', touch));
    maybeHint('potion-mp', p.potions.mp > 0 && p.mana < skillManaCost(qid, state),
      introLine('potion-mp', touch));
    // Focus / stance / stats matter from the first level-up (there is
    // something to aim and to read); the pilot choice from the first
    // intermission (banking is when AUTO vs MANUAL pays differently).
    maybeHint('focus', introSawDraft, introLine('focus', touch));
    maybeHint('stance', introSawDraft || introSawIntermission, introLine('stance', touch));
    maybeHint('stats', introSawDraft, introLine('stats', touch));
    maybeHint('pilot', introSawIntermission, introLine('pilot', touch));
    // RADAR / MAP matter the first time the world exceeds the screen: a live
    // horde with enemies beyond the view arms RADAR, a chest or shrine
    // beyond it arms MAP. Scanned only while the hint is still wanted (cheap
    // by design); the horde-size floor keeps RADAR for real pressure, not
    // the lone spawn-time straggler.
    const offView = (x, y) => {
      // Guarded like onboardingAnchor above: a headless stub without a canvas
      // rect cannot prove off-view — never arm on a guess, never throw.
      try {
        const r = worldRegion(x, y, 0).getBoundingClientRect();
        const v = canvas.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return cx < v.left || cx > v.right || cy < v.top || cy > v.bottom;
      } catch { return false; }
    };
    if (!hintShownRun.radar && !hintStore.done('radar') &&
        state.enemies.length >= 6 &&
        state.enemies.some(e => e && e.hp > 0 && offView(e.x, e.y))) {
      maybeHint('radar', true, introLine('radar', touch));
    }
    if (!hintShownRun.map && !hintStore.done('map') &&
        (((state.chests || []).some(c => offView(c.x, c.y))) ||
         ((state.shrines || []).some(s => !s.used && offView(s.x, s.y))))) {
      maybeHint('map', true, introLine('map', touch));
    }
    // '?' SUPPLEMENT (owner 2026-09-16): the "?" IS a control — it names
    // itself the first time the player is in a fight they can actually lose
    // (a real hit landed). Until then nothing urgently needs explaining, and
    // the sole existing explanation lived INSIDE the screen it opens
    // (circular: you had to know '?' to learn '?'). Retires when pressed.
    maybeHint('help', p.hp > 0 && p.hp < p.stats.maxHp * 0.9, introLine('help', touch));
  }
  // Teach-until-demonstrated (movement): ~3 seconds of real travel retires
  // the hint permanently (hintStore flag), even mid-display.
  if (!hintStore.done('move')) {
    if (hintPrevPos && dt > 0) {
      const d = Math.hypot(p.x - hintPrevPos.x, p.y - hintPrevPos.y);
      if (d / dt > 20) {   // >20 px/s reads as deliberate movement
        hintMoveTime += dt;
        if (hintMoveTime >= 3) {
          hintStore.setDone('move');
          hintStrip.retire('move');
        }
      }
    }
    hintPrevPos = { x: p.x, y: p.y };
  }
  pumpHints();
  hintStrip.update(dt);
}

// Stage-2 coachmarks: one-or-more-step Tours that PAUSE the sim until
// dismissed. `steps` is a step object or an array (multi-step = spotlight
// BOTH targets of a pair, e.g. the two skill buttons — rev-4 partial fix).
function startCoach(steps, key) {
  if (coachActive()) return;
  setTourFlag(key, true);   // seen — even if a target is missing (skip rule)
  const end = () => { coach = null; };
  coach = new Tour({ steps: Array.isArray(steps) ? steps : [steps], onDone: end,
    // TUTORIAL_OVERLAY: name the replay path on the way out of a skip.
    // PLAYER REVIEW 2026-09-17 item 1: skipping ENDS the sequence — no further
    // chip, card or hint from it appears this session. A chip already on
    // screen or queued when skip is pressed is cancelled, in any click order.
    onSkip: () => {
      end();
      hintsSuppressed = true;
      hintPending = [];
      hintStrip.clear();
      toast('TOUR SKIPPED — REPLAY IT ANY TIME IN SETTINGS');
    } });
  coach.start();
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
let tourPendingAfterReveal = false;   // the G26 loadout coach waits for the settle
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
        // (a coachmark popping mid-fade reads as a glitch). G26: the loadout
        // door coach rides the same settle gate (achievement grants land at
        // run settle, so the next title visit is the first legal moment).
        if (tourPendingAfterReveal) { tourPendingAfterReveal = false; maybeCoachLoadoutDoor(); }
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
  // NIGHT MODE (owner-authorized 2026-09-17): opt-in full auto at 50% gold.
  // SETUP is its ONLY surface (never a run key, never persisted — a reload
  // ends the night), OFF by default, and turning ON needs a SECOND
  // confirming press so the toggle cannot be tripped by accident.
  menuCard('NIGHT MODE · ' + (state.night ? 'ON' : nightArmed ? 'ARMED' : 'OFF'),
    state.night
      ? 'runs play themselves at 50% gold · press to turn OFF'
      : nightArmed
        ? 'press again to CONFIRM: runs full-auto at HALF gold'
        : 'overnight full-auto · 50% gold · two presses to turn ON (OFF by default)',
    () => { toggleNight(); showSetup(); });
  menuCard('SETTINGS', 'display, audio & save data', () => showSettings());
  // ONBOARDING REWORK: HOW TO PLAY now lives on the TITLE screen; SETUP keeps
  // CHALLENGE / STAGE / SETTINGS only.
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
    saveNoticeHtml() +
    // NIGHT MODE: the return-to-game line — time away, gold earned, the
    // multiplier applied. One line, computed when the night was toggled OFF.
    (state.nightSummary
      ? `<div class="pass">NIGHT: away ${(state.nightSummary.awayS / 3600).toFixed(1)}h` +
        ` · gold +${state.nightSummary.gold}` +
        ` · x${state.nightSummary.mult.toFixed(2)}</div>`
      : '');
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

// ---------- G26 PRE-RUN WEAPON LOADOUT (owner 2026-09-15) ---------------------
// "Player chosen weapons in a menu, not during run. Before the run." The screen
// is a DESTINATION the player finds from the title (never a forced stop before
// START GAME, never a nag); the penalty for never visiting it is ZERO — with no
// stored choice startRun arms the same starting kit a fresh account has today
// (VOLLEY + the character's starting weapon when unlocked), and a stored choice
// persists run to run. The choice REPLACES in-run weapon acquisition: openDraft
// no longer offers wpn_* grants at all, and lvl_* cards ride state.weapons, so
// the pool carries level-ups for exactly the weapons the player brought.
//
// Slots: the base volley occupies slot 1 of startWeaponSlots(profile), so the
// player picks at most slots-1 weapons here. A challenge mode that narrows the
// run's slot count is applied at startRun (the run truncates, the menu never
// needs to know the mode).
function loadoutChoices() {
  // The unlock set, ordered by the WEAPON_TYPES registry so the menu is stable
  // no matter the purchase order. VOLLEY is not in WEAPON_TYPES (it is the base
  // volley, not a slot weapon), so it can never appear here.
  const order = Object.keys(WEAPON_TYPES);
  return order.filter(id => weaponUnlocked(profile, id));
}

function loadoutSlotCap() {
  return startWeaponSlots(profile) - 1;   // slot 1 is the base volley
}

function toggleLoadoutWeapon(id) {
  if (!loadoutChoices().includes(id)) return;
  const cur = new Set(profile.loadout || []);
  if (cur.has(id)) cur.delete(id);
  else {
    if (cur.size >= loadoutSlotCap()) return;   // slot cap: the card reads DIM
    cur.add(id);
  }
  // An empty selection is "no choice" (the default kit), never a zero-weapon
  // run — the save layer stores the same null either way.
  profile.loadout = cur.size ? [...cur] : null;
  persistProfile();
  showLoadout();
}

function showLoadout() {
  openMenu('loadout');
  ovTitle.textContent = 'LOADOUT';
  ovTitle.className = '';
  const sel = new Set(profile.loadout || []);
  const cap = loadoutSlotCap();
  ovSub.textContent = (profile.loadout ? sel.size + '/' + cap + ' chosen' : 'default kit')
    + ' · the weapons the next run brings';
  for (const id of loadoutChoices()) {
    const on = sel.has(id);
    const full = !on && sel.size >= cap;
    // Unselected rows ride the existing 'dim' card style (the shop's owned/
    // unaffordable look). SGKV4 (opt-out language): the row NAMES the one-tap
    // action both ways — EQUIPPED rows say "tap to BENCH", benched rows say
    // "tap to equip" — so the opt-out affordance is on the screen itself,
    // not in a manual.
    const el = menuCard(
      WEAPON_NAMES[id],
      (on ? 'EQUIPPED — tap to BENCH' : full ? 'slots full' : 'BENCHED — tap to equip')
        + ' · ' + (describeWeaponLevel(id, 2) || ''),
      () => toggleLoadoutWeapon(id),
      !on,
    );
    // The weapon's PLAYING-CARD art (src/draft_card_art.js WEAPON_OFFER_TO_DECK
    // join — the same deck the draft painted). With wpn_* gone from the offer
    // pool this menu is the surface that join serves for weapon grants.
    const artCv = document.createElement('canvas');
    artCv.className = 'card-art';
    if (artCv.setAttribute) artCv.setAttribute('data-card', 'wpn_' + id);
    if (paintOfferArt(artCv, 'wpn_' + id)) {
      if (typeof el.insertBefore === 'function') el.insertBefore(artCv, el.firstChild);
      else el.appendChild(artCv);
    }
  }
  menuCard('DEFAULT KIT', 'clear the choice — runs use the character kit', () => {
    profile.loadout = null;
    persistProfile();
    showLoadout();
  });
  menuCard('BACK', 'to title [ESC]', () => showTitle());
}

// The run's kit from the stored choice, validated against the LIVE unlock set
// and the run's slot count (never the menu's own bookkeeping): this is what
// startRun arms. null = no choice was made (the zero-penalty default).
function chosenLoadout() {
  // state.weaponSlots is stamped by startRun just before this runs; the
  // startWeaponSlots fallback makes a PRE-run call (the __TEST seam) agree
  // with the standard-slot run it describes.
  const cap = ((state.weaponSlots || 0) || startWeaponSlots(profile)) - 1;
  const list = (profile.loadout || [])
    .filter(t => WEAPON_TYPES[t] && weaponUnlocked(profile, t))
    .slice(0, Math.max(0, cap));
  return list.length ? list : null;
}

// G26 just-in-time door coach (owner: "can it present the coaching after the
// first weapon buyable is bought?"). Fires the FIRST time the unlocked-weapon
// set grows beyond the starter kit — a weapon purchase on the shop path or an
// achievement grant — ONCE, in the tour flag store. Never during a run (both
// call sites are title/shop screens), never over a live tour, dismisses like
// every other coachmark. The dedicated event test in test/test_g26_loadout.mjs
// pins: nothing before the growth, exactly one after, the flag prevents a
// repeat, and the door stays reachable by taps without the coach ever firing.
function maybeCoachLoadoutDoor() {
  if (tourFlag(TOUR_KEYS.loadout)) return;
  if (!(profile.unlockedWeapons || []).some(w => !STARTER_WEAPONS.includes(w))) return;
  if (coachActive()) return;
  startCoach({
    id: 'loadout',
    text: 'NEW WEAPON UNLOCKED — the next run only brings what you pick. Choose your LOADOUT from the title screen.',
    target: () => (state.mode === 'title' && cardByTitle('LOADOUT')) || ovCards,
  }, TOUR_KEYS.loadout);
}

// The note itself: a PARCHMENT card on the game's real card skeleton
// (.card/.name/.desc/.key — the same classes every menu card rides), prepended
// to the title's card list so it is the first thing read and NEVER blocks
// anything (the title is not the run; START GAME sits right below it). Tap
// anywhere on the note to dismiss; the dismiss is what persists
// lastSeenUpdate, so "shown once" survives reloads.
function addWhatsNewCard() {
  const el = document.createElement('div');
  el.className = 'card paper-note';
  el.innerHTML =
    `<div class="name">${WHATS_NEW.title}</div>` +
    `<div class="desc">${WHATS_NEW.lines.map(l => '- ' + l).join('<br>')}</div>` +
    '<div class="key">tap to close</div>';
  el.onclick = () => {
    // HELP MODE parity with menuCard: a tap explains, never presses.
    if (state.helpMode) { showHelpTip('<b>' + WHATS_NEW.title + '</b> — release notes for returning players', el); return; }
    audio.playSfx('button');
    dismissWhatsNew(el);
  };
  ovCards.insertBefore(el, ovCards.firstChild);
  return el;
}
function dismissWhatsNew(el) {
  profile.lastSeenUpdate = WHATS_NEW.id;
  persistProfile();
  if (el && el.remove) el.remove();
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
  // v9 WHAT'S NEW: the note is a LAUNCH artifact — attempted on the FIRST
  // title entry per page load only (never on death-screen TITLE returns),
  // and whatsNewDueFor owns every gate (marked release, returning profile,
  // not-yet-dismissed, lastPlayed predates the ship date).
  if (!whatsNewTried) {
    whatsNewTried = true;
    if (whatsNewDueFor(profile, WHATS_NEW, bootResult.status === 'fresh')) addWhatsNewCard();
  }
  menuCard('START GAME', 'start a run',
    // UP-FRONT CONTROLS: a fresh profile meets the reference FIRST (the
    // gate), GOT IT starts the run; everyone else goes straight in.
    () => (onboardingDone() ? beginTitleHold() : showHowToPlay({ intoRun: true })));   // N2: fade out + hold the art ~1s, then startRun()
  // MENU CONDENSE M5: the fresh-browser LOAD FROM DISK card is folded into
  // SAVE DATA (SETUP -> SETTINGS -> SAVE DATA -> IMPORT SAVE) — the same
  // validated pickImportFile -> importSaveText -> importProfileText path.
  // The `fresh` flag stays live for paintTitleHeader's fresh copy.
  menuCard('SHOP', 'permanent upgrades', () => showShop());
  menuCard('CHARACTERS', 'unlock & equip', () => showCharacters());
  // G26: the LOADOUT door. A destination the player FINDS (owner: "the player
  // should have to go find the weapon selection in a menu") — never a forced
  // stop, never a gate: the sub-line names the live state so the card carries
  // its own information, and START GAME keeps starting immediately.
  menuCard('LOADOUT',
    profile.loadout
      ? profile.loadout.length + '/' + (startWeaponSlots(profile) - 1) + ' weapons chosen'
      : 'pick this run\'s weapons', () => showLoadout());
  // U1 (owner 2026-09-14): the menu was eleven cards. TROPHIES/BESTIARY and
  // CHALLENGE/STAGE/SETTINGS/HOW TO PLAY now live behind two doors, and the
  // doors' sub-lines carry the live numbers the moved cards used to show,
  // so nothing is hidden that a player needs before pressing.
  // MENU CONDENSE (2026-09-17, owner rulings VJBFV): D3 EXIT GAME is removed
  // (closing the tab saves & quits — autosave already fires); M5 folded the
  // fresh LOAD FROM DISK card into SAVE DATA; D4 CHARACTERS is KEPT (owner
  // wants the card; the duplicate SHOP door is not a removal reason) — so
  // the title is SEVEN cards, HOW TO PLAY last. exitGame()/showFarewell and
  // the `game: exitGame` __TEST seam survive unreached by cards.
  menuCard('PROGRESS', `${earnedCount(profile)} / ${totalAchievements()} emblems · ` +
    `${seenCount(profile)} / ${totalEncounters()} met`, () => showProgress());
  menuCard('SETUP', stageCardSub().split(' · ')[0] + ' · challenge, stage, options',
    () => showSetup());
  // ONBOARDING REWORK (owner-approved 2026-09-16): HOW TO PLAY moves OUT of
  // SETUP onto the title — a confused player does not open SETUP to look for
  // help. SETUP keeps CHALLENGE / STAGE / SETTINGS.
  menuCard('HOW TO PLAY', 'the point + every button', () => showHowToPlay());
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
  // N2 DO 4 (onboarding rework): only the G26 loadout door coach waits for
  // the reveal settle now — the title-card tour is retired.
  if (revealSettled()) { maybeCoachLoadoutDoor(); }
  else tourPendingAfterReveal = true;
}

// G14: the live registry of shop-row icon canvases, rebuilt by showShop() so
// the __TEST.shopIcons seam can report painted pixels per row id without DOM
// scraping heuristics.
const shopIconCanvases = {};

// ---------- SHOP PAGING + THE CARD GRID (owner 2026-09-18) ------------------
// Owner verbatim: "Arrow pages are better. The cards need to dynamically
// resize and fit a minimum of 3 across. Max size of a card being the current
// size they are". Variant A of docs/art/shop-paging-2026-09-18/REPORT.md,
// built into the LIVE shop: fixed pages, edge arrows + swipe + "n / m"
// indicator. The GRID RULE is one pure function (shopGridPlan — the uiFitScale
// precedent: matrix-testable without a layout engine) and the page chunking
// is pure too (shopPageChunk over measured row heights). Paging changes how
// rows are REACHED, never what a row does: purchases, counts, the opt-out
// rule, the apex/characters doors and every balance constant are untouched.
const SHOP_GAP = 12;          // the one grid gap (the old 10/14 split is superseded here)
const SHOP_CARD_CAP = 198;    // today's card border-box (170 + 2x14): the HARD ceiling
const SHOP_MIN_COLS = 3;      // the owner's floor, at EVERY size including 320-wide
const SHOP_MAX_COLS = 5;      // the container cap's own width: 5x198+4x12 (desktop addendum)
const SHOP_IND_H = 26;        // the indicator strip pages must clear
const SHOP_ARR_W = 46;        // the arrow target's box (44px floor + border), edge-mounted
const SHOP_ARR_H = 64;        // mid-height arrow (desktop)
const SHOP_ARR_LOW_H = 44;    // the bottom-band arrow sits at exactly the 44px touch floor

// Pure: the column plan for a container availW CSS px wide. Cards size
// DYNAMICALLY as (availW - (cols-1)*gap)/cols, floored at 3 columns and
// capped at the current card box — a wide window gains COLUMNS (never bigger
// cards) and the container's own max-width stops the count at 5, the surplus
// becoming centred margin; a narrow one shrinks the card to hold 3. Int px.
function shopGridPlan(availW) {
  const cols = Math.max(SHOP_MIN_COLS,
    Math.min(SHOP_MAX_COLS, Math.floor((availW + SHOP_GAP) / (SHOP_CARD_CAP + SHOP_GAP))));
  const w = Math.min(Math.floor((availW - (cols - 1) * SHOP_GAP) / cols), SHOP_CARD_CAP);
  return { cols, cardW: Math.max(w, 1) };
}

// Pure: chunk rows (each its tallest card's height, CSS px) into pages that
// fit availH. A row never splits; every page takes at least one row (a row
// taller than the viewport pages alone — content is never crushed to fit).
function shopPageChunk(rowHs, availH) {
  const pages = []; let cur = [], used = 0;
  for (let i = 0; i < rowHs.length; i++) {
    const h = rowHs[i];
    if (cur.length && used + SHOP_GAP + h > availH) { pages.push(cur); cur = []; used = 0; }
    cur.push(i);
    used += (cur.length > 1 ? SHOP_GAP : 0) + h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

let shopPager = null;         // { pages: [rowIdx[]], rows: [{cards, h}], page, cols }
let shopPageWanted = 1;       // survives the buy re-render: you stay on your page
function shopPagerActive() { return !!shopPager && state.mode === 'menu'; }

function clearShopPager() {
  shopPager = null;
  for (const id of ['shop-prev', 'shop-next', 'shop-ind']) {
    const el = document.getElementById(id);
    if (el && el.remove) el.remove();
  }
  if (ovCards.classList) ovCards.classList.remove('shopgrid');
  else if (ovCards.className && typeof ovCards.className === 'string') {
    ovCards.className = ovCards.className.replace(/\bshopgrid\b/g, '').trim();
  }
  // the low-band top-align is shop-scoped with the rest of the chrome
  if (overlay.classList) overlay.classList.remove('shop-low');
  else if (typeof overlay.className === 'string') {
    overlay.className = overlay.className.replace(/\bshop-low\b/g, '').trim();
  }
}

// Applies the grid class + cols var BEFORE the rows are built, so the first
// layout already sizes the cards and the pager measures true heights. Stub
// DOMs (no clientWidth) fall back to viewSize() — the abbreviation decision
// stays deterministic in the node suite.
function applyShopGrid() {
  const w = (typeof ovCards.clientWidth === 'number' && ovCards.clientWidth > 0)
    ? ovCards.clientWidth : Math.max(0, viewSize().vw - 16);
  const plan = shopGridPlan(w);
  if (ovCards.classList) ovCards.classList.add('shopgrid');
  if (ovCards.style && typeof ovCards.style.setProperty === 'function') {
    ovCards.style.setProperty('--shop-cols', String(plan.cols));
  }
  return plan;
}

// After the browser's layout pass (rAF — it runs before the first paint, so
// the un-paged list never flashes; the frameCard-lazy precedent): measure the
// rows, chunk them into pages, show the wanted page, mount the chrome.
function finalizeShopPager() {
  if (state.mode !== 'menu' || !ovCards.children || !ovCards.children.length) return;
  if (typeof ovCards.clientWidth !== 'number' || !ovCards.clientWidth) return;   // stub: markup is the contract
  armShopSwipe();
  const cards = [...ovCards.children];
  const plan = shopGridPlan(ovCards.clientWidth);
  // uniform card widths -> DOM order fills rows of exactly `cols` (the last
  // row may be short); a row's height is its tallest card (flex stretch).
  const rows = [];
  for (let i = 0; i < cards.length; i += plan.cols) {
    const row = cards.slice(i, i + plan.cols);
    rows.push({ cards: row, h: Math.max(...row.map(c => (c.offsetHeight || 0))) });
  }
  // ARROW PLACEMENT: a mid-height edge arrow sits ON the edge column whenever
  // the grid fills the viewport width (phones: the first card starts inside
  // the arrow's band) and hides that card's price text — measured in the
  // 320x568 shot, 2026-09-18. There the arrows drop to the BOTTOM band,
  // flanking the indicator (the prime thumb zone anyway); desktop keeps the
  // mid-height arrows (the capped container centres with margin, no overlap).
  const firstRect = (typeof cards[0].getBoundingClientRect === 'function')
    ? cards[0].getBoundingClientRect() : null;
  const low = firstRect ? firstRect.left < SHOP_ARR_W + 8 : false;
  // top-align with the bottom band (the safe-centre rule would push the last
  // row back down under the arrows the page math already cleared).
  if (overlay.classList) overlay.classList.toggle('shop-low', low);
  else if (typeof overlay.className === 'string' && low && !/\bshop-low\b/.test(overlay.className)) {
    overlay.className += ' shop-low';
  }
  // the low band (44px arrows + indicator, both at bottom:8) is taller than
  // the indicator strip alone — the last row must clear the real chrome.
  const availH = Math.max(60, overlay.clientHeight - (ovCards.offsetTop || 0)
    - (low ? SHOP_ARR_LOW_H + 8 : SHOP_IND_H) - 10);
  const pages = shopPageChunk(rows.map(r => r.h), availH);
  shopPager = { pages, rows, page: Math.min(Math.max(1, shopPageWanted), pages.length), cols: plan.cols, low };
  shopPageGoto(shopPager.page);
}

function shopPageGoto(p) {
  if (!shopPager) return;
  const n = Math.min(Math.max(1, p), shopPager.pages.length);
  shopPager.page = n;
  shopPageWanted = n;
  const show = new Set();
  for (const ri of shopPager.pages[n - 1]) for (const c of shopPager.rows[ri].cards) show.add(c);
  for (const c of ovCards.children) c.style.display = show.has(c) ? '' : 'none';
  shopChromeUpdate();
}

// The chrome: edge arrows + "n / m · cols x rowsOnPage" indicator. A SINGLE
// page shows NEITHER (the desktop addendum: "a single page shows no arrows
// (there is nothing to page) and no empty affordance").
function shopChromeUpdate() {
  const one = !shopPager || shopPager.pages.length <= 1;
  for (const [id, dir, glyph] of [['shop-prev', -1, '\u2039'], ['shop-next', 1, '\u203a']]) {
    let el = document.getElementById(id);
    if (one) { if (el && el.remove) el.remove(); continue; }
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'shop-arr ' + (dir < 0 ? 'prev' : 'next');
      el.textContent = glyph;
      el.onclick = () => { audio.playSfx('button'); shopPageGoto(shopPager.page + dir); };
      overlay.appendChild(el);
    }
    const dim = (dir < 0 && shopPager.page <= 1) || (dir > 0 && shopPager.page >= shopPager.pages.length);
    if (el.classList) { el.classList.toggle('dim', dim); el.classList.toggle('low', !!shopPager.low); }
    else if (el.className !== undefined) el.className = 'shop-arr ' + (dir < 0 ? 'prev' : 'next')
      + (dim ? ' dim' : '') + (shopPager.low ? ' low' : '');
  }
  let ind = document.getElementById('shop-ind');
  if (one) { if (ind && ind.remove) ind.remove(); return; }
  if (!ind) { ind = document.createElement('div'); ind.id = 'shop-ind'; overlay.appendChild(ind); }
  ind.textContent = shopPager.page + ' / ' + shopPager.pages.length +
    ' \u00b7 ' + shopPager.cols + '\u00d7' + shopPager.pages[shopPager.page - 1].length;
}

// Swipe (the phone's first-class input — carousel convention: finger left =
// next page). Mounted ONCE on the overlay; inert whenever the pager is not
// the live screen. A horizontal-dominant 60px+ flick turns the page; taps and
// vertical scrolls never do. TOUCH carries the phone (a real finger AND the
// CDP touch pipeline both speak touchstart/touchend); the pointer path stays
// as the MOUSE fallback only — never a double turn on a real touch device.
let shopSwipeArmed = false;
function armShopSwipe() {
  if (shopSwipeArmed || typeof overlay.addEventListener !== 'function') return;
  shopSwipeArmed = true;
  let x0 = null, y0 = null;
  const begin = (x, y) => { x0 = shopPagerActive() ? x : null; y0 = y; };
  const end = (x, y) => {
    if (x0 === null || !shopPagerActive()) { x0 = null; return; }
    const dx = x - x0, dy = y - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    shopPageGoto(shopPager.page + (dx < 0 ? 1 : -1));
  };
  overlay.addEventListener('touchstart', (ev) => {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (t) begin(t.clientX, t.clientY);
  }, { passive: true });
  overlay.addEventListener('touchend', (ev) => {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (t) end(t.clientX, t.clientY);
  }, { passive: true });
  overlay.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') begin(ev.clientX, ev.clientY);
  });
  overlay.addEventListener('pointerup', (ev) => {
    if (ev.pointerType === 'mouse') end(ev.clientX, ev.clientY);
  });
}

function showShop() {
  openMenu();
  ovTitle.textContent = 'SHOP';
  ovTitle.className = '';
  // E1: the banked meta balance reads BANK — GOLD is the in-run purse now.
  ovSub.textContent = `BANK: ${profile.gold}`;
  for (const key of Object.keys(shopIconCanvases)) delete shopIconCanvases[key];
  // SHOP PAGING: the grid class + cols var go on BEFORE the rows are built
  // (first layout sizes the cards; the pager then measures true heights).
  // ABBREV (owner: the buy line "may be abbreviated for the narrower card but
  // it stays TEXTUAL and stateful"): under 112px the sub-line shortens to
  // `LV n/max·Ng` — OWNED/MAX stay words, the state is never an icon.
  const gridPlan = applyShopGrid();
  const abbrev = gridPlan.cardW < 112;
  // ONE-LINE BUY FLOOR (320px shot read, 2026-09-18): the abbreviated buy
  // line "LV 0/5·180g" must stay on ONE line — "LV" may never orphan from its
  // fraction (it wrapped at cardW 93: 77px of text width vs an ~79px string
  // at 12px monospace). The buy span is nowrap and its font auto-sizes to the
  // WIDEST sub this catalogue state can show at this width (monospace advance
  // is 0.6em), clamped to [9,12] — still textual, still stateful, never
  // clipped. First pass computes every sub, second pass renders.
  const rows0 = SHOP_UPGRADES.map(def => {
    // WAVE-11: weapon/elite rows are SINGLE-PURCHASE unlocks — ownership
    // lives in profile.unlockedWeapons/unlockedElites (meta.js shopRowOwned),
    // not profile.purchased. buyUpgrade dispatches on kind either way.
    const lvl = profile.purchased[def.id] || 0;
    const owned = def.kind ? shopRowOwned(profile, def) : false;
    const capped = def.kind ? owned : lvl >= def.maxLevel;
    const cost = def.kind ? def.baseCost : upgradeCost(def, lvl);
    const afford = profile.gold >= cost;
    const sub = abbrev
      ? (def.kind
        ? (owned ? 'OWNED' : cost + 'g')
        : `LV ${lvl}/${def.maxLevel}\u00b7${capped ? 'MAX' : cost + 'g'}`)
      : (def.kind
        ? (owned ? 'OWNED' : cost + ' gold')
        : `LV ${lvl}/${def.maxLevel} \u00b7 ${capped ? 'MAXED' : cost + ' gold'}`);
    return { def, sub, capped, afford };
  });
  if (abbrev && ovCards.style && typeof ovCards.style.setProperty === 'function') {
    const maxCh = Math.max(...rows0.map(r => r.sub.length));
    const fs = Math.max(9, Math.min(12, Math.floor((gridPlan.cardW - 16) / (0.6 * maxCh))));
    ovCards.style.setProperty('--shop-buy-fs', fs + 'px');
  }
  // SHOP-LATENCY: defer every row's frame so the WHOLE list appends (and lays
  // out once) before the first frame measures - then frame them all together.
  const framed = [];
  for (const { def, sub, capped, afford } of rows0) {
    const el = menuCard(
      def.name,
      abbrev ? `${def.desc}<br><span class="buy">${sub}</span>` : `${def.desc}<br>${sub}`,
      () => {
        // SGKV4: read the loadout BEFORE the buy — the weapon path equips on
        // buy (buyUpgrade -> equipBoughtWeapon), and the displacement (if the
        // loadout was full) is diffed from these two reads so the line the
        // player sees can NAME both halves. A swap must never be silent.
        const kitBefore = profile.loadout ? [...profile.loadout] : null;
        if (buyUpgrade(profile, def.id)) {
          persistProfile();
          showShop();
          if (def.kind === 'weapon') {
            const now = profile.loadout || [];
            const added = now.find(w => !kitBefore || !kitBefore.includes(w));
            const benched = kitBefore ? kitBefore.find(w => !now.includes(w)) : null;
            if (added != null) {
              toast(benched != null
                ? 'EQUIPPED ' + WEAPON_NAMES[added] + ' / BENCHED ' + WEAPON_NAMES[benched] + ' — see LOADOUT'
                : 'EQUIPPED ' + WEAPON_NAMES[added] + ' — in your LOADOUT');
            }
          }
          // G26: a successful WEAPON purchase is the just-in-time moment the
          // owner picked ("after the first weapon buyable is bought") — the
          // unlocked set just grew, so the loadout door coach checks now, on
          // the re-rendered shop. Stat/mana/slot rows never fire it.
          if (def.kind === 'weapon') maybeCoachLoadoutDoor();
        }
      },
      capped || !afford,
      true,   // deferFrame: batched with `framed` below
    );
    framed.push(el);
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
  // G25 slice 1: the APEX entry row exists ONLY when the gate is open — the
  // panel is absent (not greyed) until the normal catalogue is finished, so
  // an in-progress shopper never sees the tier at all.
  if (apexUnlocked(profile)) {
    menuCard('APEX', 'the post-completion tier — rule-breakers, priced for the grind', () => showApexShop());
  }
  // G19 slice 1: the per-character layer's door, ON the shop screen beside
  // the global catalogue it sits on top of — the owner wants it FOUND. Same
  // menuCard door pattern as SHOP/APEX above.
  menuCard('CHARACTERS', 'per-pilot upgrades', () => showCharacterShop());
  menuCard('BACK', 'to title [ESC]', () => showTitle());
  for (const el of framed) frameCard(el, true);   // lazy: the observer paints after the browser's own layout pass
  // SHOP PAGING: pages are chunked after the browser's layout pass (the rAF
  // runs before the first paint — the un-paged list never flashes) and the
  // wanted page SURVIVES this re-render: buying keeps you where you bought.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finalizeShopPager);
  else finalizeShopPager();
}

// ---------- G19 slice 1: the per-character shop surface ---------------------
// Two screens, both built from the shop's own conventions (menuCard rows,
// shopIcon + shopIconCanvases, saveProfile then re-render). The DOOR lists
// the four pilots with their unlock state; a pilot's screen lists THAT
// pilot's rows as `LV <n>/<max> · <cost> gold` or `MAXED`. A LOCKED pilot's
// rows are visible but the purchase is REFUSED with the reason legible on
// the row itself — the same dim + sfx-only click the capped global rows use,
// and buyCharacterUpgrade enforces it at the data layer too.
function showCharacterShop() {
  openMenu();
  ovTitle.textContent = 'CHARACTERS';
  ovTitle.className = '';
  // E1: the banked meta balance reads BANK — GOLD is the in-run purse now.
  ovSub.textContent = `BANK: ${profile.gold}`;
  for (const key of Object.keys(shopIconCanvases)) delete shopIconCanvases[key];
  for (const ch of Object.values(CHARACTERS)) {
    const owned = profile.unlockedCharacters.includes(ch.id);
    const rows = CHARACTER_UPGRADES.filter(u => u.characterId === ch.id);
    const lvls = rows.reduce((s, u) => s + getCharacterUpgradeLevel(profile, ch.id, u.id), 0);
    menuCard(ch.name,
      `${owned ? 'owned' : 'locked — ' + ch.unlockCost + ' gold'}<br>` +
      `${rows.length} upgrades · ${lvls} level${lvls === 1 ? '' : 's'} bought`,
      () => showCharacterRows(ch.id));
  }
  menuCard('BACK', 'to shop', () => showShop());
}

function showCharacterRows(characterId) {
  const ch = CHARACTERS[characterId];
  if (!ch) return showCharacterShop();
  openMenu();
  ovTitle.textContent = ch.name.toUpperCase();
  ovTitle.className = '';
  const owned = profile.unlockedCharacters.includes(characterId);
  // E1: the banked meta balance reads BANK; a locked pilot names the reason in
  // the sub-line so the refusal is legible before any row is tapped.
  // G19 slice 2: the STRONG/WEAK identity rides the sub-line too, DERIVED from
  // CHARACTER_SPECIALTIES via specialtyLines (the same helper the kit panel
  // reads), legible for LOCKED pilots as well.
  const idLines = specialtyLines(characterId) || { strong: '', weak: '' };
  ovSub.innerHTML = `BANK: ${profile.gold}` +
    (owned ? '' : ` · LOCKED — ${ch.name} not unlocked (${ch.unlockCost} gold)`) +
    `<br>${idLines.strong} · ${idLines.weak}`;
  for (const key of Object.keys(shopIconCanvases)) delete shopIconCanvases[key];
  const framed = [];
  for (const def of CHARACTER_UPGRADES.filter(u => u.characterId === characterId)) {
    const lvl = getCharacterUpgradeLevel(profile, characterId, def.id);
    const capped = lvl >= def.maxLevel;
    const cost = upgradeCost(def, lvl);
    const afford = profile.gold >= cost;
    const sub = !owned
      ? `LOCKED — buy ${ch.name} first (${ch.unlockCost} gold)`
      : `LV ${lvl}/${def.maxLevel} · ${capped ? 'MAXED' : cost + ' gold'}`;
    const el = menuCard(
      def.name,
      `${def.desc}<br>${sub}`,
      () => {
        if (buyCharacterUpgrade(profile, characterId, def.id)) {
          persistProfile();
          showCharacterRows(characterId);
        }
      },
      !owned || capped || !afford,
      true,   // deferFrame: batched with `framed` below, like showShop's rows
    );
    framed.push(el);
    if (!owned || capped) el.onclick = () => audio.playSfx('button');
    // The icon path is the shop's own (src/art/shop_icons.js): authored grid
    // per id, authored __fallback otherwise — the SAME fallback every
    // un-arted global row gets, no second icon system (disclosed in the G19
    // report: these ids have no authored icons yet).
    const cv = document.createElement('canvas');
    cv.className = 'shop-icon';
    cv.width = 16; cv.height = 16;
    if (el.insertBefore) el.insertBefore(cv, el.firstChild);
    else el.appendChild(cv);          // stub DOM: markup string is the contract
    const icon = shopIcon(def.id);
    renderer.drawGrid(cv.getContext('2d'), icon.grid, icon.palette, 0, 0);
    shopIconCanvases[def.id] = cv;
  }
  menuCard('BACK', 'to characters', () => showCharacterShop());
  for (const e of framed) frameCard(e, true);
}

// ---------- G25 slice 1: THE APEX PANEL ------------------------------------
// Its own screen (ovTitle 'APEX'), one row per apex item + the toggle, all
// through the same menuCard/widget/icon conventions as the shop. Reaching it
// requires apexUnlocked (the only door is the gated row above), but the body
// still states the gate so the tier is never mistaken for normal shop stock.
function showApexShop() {
  openMenu();
  ovTitle.textContent = 'APEX';
  ovTitle.className = 'logo';
  const open = apexUnlocked(profile);
  const missing = SHOP_UPGRADES.filter(d => !shopRowOwned(profile, d)).length;
  ovSub.innerHTML = `BANK: ${profile.gold}` +
    (open ? '' : ` · COMPLETE THE CATALOGUE FIRST — ${missing} ROW${missing === 1 ? '' : 'S'} LEFT`);
  for (const key of Object.keys(shopIconCanvases)) delete shopIconCanvases[key];
  if (open) {
    // The TOGGLE (one activation flips it, persisted immediately): apex must
    // always be switchable off — the Megabonk lesson. Apex ON marks every
    // run (and powers the rule-breakers you own); OFF restores an honest run.
    const on = apexEnabled(profile);
    menuCard(`APEX ${on ? 'ON' : 'OFF'}`,
      on ? 'boosted runs — your results are marked APEX'
        : 'clean runs — toggle on to use your apex items',
      () => { setApexEnabled(profile, !on); persistProfile(); showApexShop(); });
    // G25 slice 2: the ONE door to the full-screen apex gallery. It lives
    // inside the gate-open branch, so a locked shopper gets no card, no key
    // and no path (requirement 4: the tier cannot even be LISTED early).
    menuCard('GALLERY', 'the apex emblems, full-screen [ESC to return]', () => showApexGallery());
    for (const def of APEX_UPGRADES) {
      const owned = apexOwned(profile, def.id);
      const afford = profile.gold >= def.baseCost;
      const sub = owned ? 'OWNED' : `${def.baseCost} gold`;
      const el = menuCard(
        def.name,
        `${def.desc}<br>REMOVES: ${def.removes}<br>${sub}`,
        () => {
          if (buyApex(profile, def.id)) { persistProfile(); showApexShop(); }
        },
        owned || !afford,
      );
      if (owned) el.onclick = () => audio.playSfx('button');
      // Same G14 icon convention as every shop row (authored 16x16 grid,
      // integer CSS scale, unknown ids fall back to the rune — never a
      // blank box).
      const cv = document.createElement('canvas');
      cv.className = 'shop-icon';
      cv.width = 16; cv.height = 16;
      if (el.insertBefore) el.insertBefore(cv, el.firstChild);
      else el.appendChild(cv);
      const icon = shopIcon(def.id);
      renderer.drawGrid(cv.getContext('2d'), icon.grid, icon.palette, 0, 0);
      shopIconCanvases[def.id] = cv;
    }
  }
  menuCard('BACK', 'to shop', () => showShop());
}

// ---------- G25 slice 2: THE APEX GALLERY (mode 'apex') ---------------------
// The tier's trophy case, as a screen: ONE apex item at a time, drawn
// FULL-SCREEN by renderer.drawTrophyShowcase — the G9 showcase renderer, NOT a
// second idiom (the bestiary comment in render.js names that rule). This is
// done by writing the SAME state.trophyView contract the trophy gallery
// writes, so the renderer, its geometry seam (this.trophyShowcase) and its
// no-op-when-null behaviour are all inherited rather than duplicated.
//
// REACHABILITY: the only door is the GALLERY card inside the gated apex panel
// (openMenu above renders it solely when apexUnlocked). showApexGallery ALSO
// re-checks the gate itself, so a stale handler or a probe cannot open it on a
// locked profile. BACK/ESC return to the PANEL, never the title.
//
// WHAT LEAKS: nothing beyond the panel. The ring walks APEX_UPGRADES (the ONE
// catalogue — name/desc/removes/cost are read off it, never restated here).
// An UNOWNED entry paints the shared LOCKED silhouette with a LOCKED caption
// and its price — the panel two taps away already shows the same name and
// price to the same gate-open player, so the mask is the tease, not a spoiler,
// and a gate-closed player sees none of this.
function apexGalleryModel() {
  return APEX_UPGRADES.map(def => ({
    id: def.id, def,
    owned: apexOwned(profile, def.id),
    art: apexOwned(profile, def.id) ? apexArt(def.id) : apexArt(APEX_FALLBACK_ID),
  }));
}

function refreshApexView() {
  const model = apexGalleryModel();
  const n = model.length;
  if (n === 0) {
    state.trophyView = null;
    ovTitle.textContent = 'APEX';
    ovTitle.className = 'logo';
    ovSub.textContent = 'no apex items authored';
    return;
  }
  state.apexIdx = ((state.apexIdx % n) + n) % n;
  const e = model[state.apexIdx];
  ovTitle.textContent = 'APEX';
  ovTitle.className = 'logo';
  // The SAME payload shape the trophy gallery writes: { art, locked, id }.
  // The art is ALREADY masked (LOCKED silhouette when unowned), so the
  // showcase cannot disagree with the caption about what is owned.
  state.trophyView = { art: e.art, locked: !e.owned, id: e.id };
  const lines = [
    `${state.apexIdx + 1} / ${n}`,
    `${e.def.name} — REMOVES: ${e.def.removes}`,
    e.owned ? 'OWNED' : `LOCKED — ${e.def.baseCost} gold`,
  ];
  ovSub.innerHTML = lines.join('<br>');
}

function showApexGallery() {
  // The gate is checked HERE too, not only at the card: an unreachable screen
  // must stay unreachable, whatever calls this.
  if (!apexUnlocked(profile)) return;
  state.apexReturn = state.mode;
  openMenu('apex');
  // Same inline overrides as showTrophies: the canvas showcase owns the middle
  // of the view, the cards sit at the bottom edge, no sheet background.
  overlay.style.background = 'transparent';
  overlay.style.justifyContent = 'flex-end';
  refreshApexView();
  menuCard('PREV', 'previous apex item', () => apexStep(-1));
  menuCard('NEXT', 'next apex item', () => apexStep(1));
  menuCard('BACK', 'to the apex panel [ESC]', () => { closeApexGallery(); showApexShop(); });
}

// Step the ring by `delta` and repaint — the trophy gallery's exact contract
// (wrap at both ends; a no-op outside the screen so a stale card cannot
// repaint another screen's caption).
function apexStep(delta) {
  if (state.mode !== 'apex') return;
  state.apexIdx += (Number(delta) || 0);
  refreshApexView();
}

// Leave the gallery. NULLS the shared trophyView so the next frame paints no
// showcase over the panel (the seam contract: null on every exit path).
function closeApexGallery() {
  if (state.mode !== 'apex') return;
  state.trophyView = null;
  state.mode = state.apexReturn || 'menu';
  overlay.style.display = 'none';
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
  // G19: the preview runs the RUN'S OWN chain (meta bonuses -> character ->
  // that character's upgrade levels), so it cannot drift from startRun.
  const st = applyCharacterUpgrades(
    applyCharacter(applyMetaBonuses({ ...base }, profile.purchased), ch.id),
    profile, ch.id);
  const owned = profile.unlockedCharacters.includes(ch.id);
  return {
    id: ch.id, name: ch.name,
    owned, equipped: profile.equippedCharacter === ch.id,
    unlockCost: ch.unlockCost,
    baseHp: base.maxHp, maxHp: st.maxHp,
    maxMana: st.maxMana,
    speedMult: +(st.speed / base.speed).toFixed(2),
    spellCostMult: st.manaCostMult || 1,
    // startPotionCount's formula, inlined for a pilot that is not equipped —
    // including the G19 satchel term (characterPotionBonus, the same helper
    // startPotionCount reads, so preview and run share one definition).
    potions: ch.startPotions + (profile.purchased.potions || 0) + characterPotionBonus(profile, ch.id),
    weapon: ch.startingWeapon ? WEAPON_NAMES[ch.startingWeapon] : WEAPON_NAMES.VOLLEY + ' (BASE)',
    skill: C.SKILLS[ch.skill].NAME,
    healOnChest: st.healOnChest != null ? st.healOnChest : ch.healOnChest,
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
  // G19 slice 2: the legible identity — DERIVED from CHARACTER_SPECIALTIES via
  // specialtyLines (the same helper the per-character shop rows read), so this
  // screen can never disagree with the combat terms. Shown for LOCKED pilots
  // too: the point is legibility BEFORE the player invests.
  const idLines = specialtyLines(kit.id);
  if (idLines) { lines.push(idLines.strong); lines.push(idLines.weak); }
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
          if (equipCharacter(profile, ch.id)) persistProfile();
        } else if (afford) {
          // buy -> equip in one flow (preserved verbatim from the 0.98 screen)
          if (unlockCharacter(profile, ch.id)) {
            equipCharacter(profile, ch.id);
            persistProfile();
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
  persistProfile();
  saveNotice = res.status === 'imported-migrated'
    ? `SAVE IMPORTED — upgraded to the current format (v${SCHEMA_VERSION}).`
    : 'SAVE IMPORTED.';
  return res;
}

let resetArmed = false;
let endArmed = false;   // WAVE-18 (#6): END RUN two-tap arm (same pattern as RESET)
// MENU CONDENSE (2026-09-17, owner rulings on the VJBFV prune proposal): the
// 12/14-card settings wall is now SIX cards in both contexts — AUDIO,
// DISPLAY, PILOT, HOW TO PLAY, SAVE DATA (title) / END RUN (in-run), BACK —
// with the full ladders one tap deeper in the three sub-screens below.
// Merges: M1 zoom+resolution+text hud -> DISPLAY; M2 music+sfx -> AUDIO;
// M3 export+import+recovery+reset -> SAVE DATA. Removals: D1 TEST: ESCAPE
// SEQUENCE (debug-gated below), D2 RECOVERY FILE (PREVIOUS) (one rescue
// slot), REPLAY TOUR moved into HOW TO PLAY (M4). E1/E2 follow: RESET keeps
// its two-tap arm, and the FULL zoom/resolution ladders stay reachable one
// tap deeper inside DISPLAY.
function showSettings(disarm = true, inRun = false) {
  openMenu(inRun ? 'settings' : 'menu');
  // Sk408 bug: the arm click re-rendered through here, which cleared the
  // arm flag the same frame it was set — RESET could never confirm. Only
  // disarm when settings is opened fresh (title menu or the in-run cog).
  if (disarm) { resetArmed = false; endArmed = false; }
  ovTitle.textContent = 'SETTINGS';
  ovTitle.className = '';
  ovSub.textContent = 'display, audio & save data' + (saveNotice ? ' · ' + saveNotice : '');
  menuCard('AUDIO',
    'music ' + (audio.getMusicEnabled() ? 'ON' : 'OFF') + ' &middot; sfx ' + (audio.getSfxEnabled() ? 'ON' : 'OFF'),
    () => showAudioSettings(inRun));
  menuCard('DISPLAY',
    state.zoom + 'x &middot; ' + resMode().toLowerCase() + ' &middot; hud ' + (hudTextEnabled() ? 'ON' : 'OFF'),
    () => showDisplaySettings(inRun));
  // G31: the pilot cycle, selectable PRE-RUN as well as in-run (the O key /
  // touch PILOT button were mid-run only, so the persisted choice could not
  // be set before the first run). Same togglePilotMode seam as the key.
  menuCard('PILOT', 'currently ' + pilotPrefLabel() +
    ' (auto all / auto move / manual) — persists between runs', () => {
      togglePilotMode();
      showSettings(true, inRun);
    });
  // IN-RUN REFERENCE ACCESS (owner 2026-09-16: "the users want to know what
  // each control does..."): the reference is ONE screen, reachable from every
  // door. In-run it opens under this same pause mode, so GOT IT (and ESC)
  // resume the fight through closeSettings — the BACK discipline.
  menuCard('HOW TO PLAY', 'every control + the field objects', () => showHowToPlay({ inRun }));
  // M3: export/import/recovery/reset live behind ONE door, title-only (the
  // in-run screen deliberately carries END RUN instead — E1).
  if (!inRun) {
    menuCard('SAVE DATA', 'export, import & reset', () => showSaveData());
  }
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
  // V1 play-test affordance (owner ask): the escape's real trigger is beating
  // the wave-1 boss and entering the portal, unreachable while play-testing —
  // so the paused run offers the entry here. It goes through the REAL
  // startEscape seam flagged as a test entry (no payout, no intermission:
  // every exit returns to this screen with the run still live).
  // MENU CONDENSE D1: off the player surface — offered ONLY when the debug
  // flag is set (localStorage 'hordes_debug' = '1'; the dev runbook flips
  // it from the console). Card order still ahead of BACK when present.
  if (inRun && (() => { try { return localStorage.getItem('hordes_debug') === '1'; } catch { return false; } })()) {
    menuCard('TEST: ESCAPE SEQUENCE', 'play-test the side-scroll (no payout)', () => {
      closeSettings();
      startEscape({ test: true });
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

// ---------- MENU CONDENSE sub-screens (M1/M2/M3) -------------------------------
// Each is a plain menu: the merged rows, verbatim mechanics, plus a BACK that
// returns to SETTINGS in the SAME context (title or in-run pause). The arms
// (RESET two-tap) disarm only via showSettings's fresh-open rule, so walking
// back out of a sub-screen disarms honestly — the Sk408 arm bug stays fixed.

// M2: MUSIC + SFX behind one AUDIO door.
function showAudioSettings(inRun = false) {
  openMenu(inRun ? 'settings' : 'menu');
  ovTitle.textContent = 'AUDIO';
  ovTitle.className = '';
  ovSub.textContent = 'music & sound effects';
  menuCard('MUSIC', 'currently ' + (audio.getMusicEnabled() ? 'ON' : 'OFF'), () => {
    audio.setMusicEnabled(!audio.getMusicEnabled());
    showAudioSettings(inRun);
  });
  menuCard('SFX', 'currently ' + (audio.getSfxEnabled() ? 'ON' : 'OFF'), () => {
    audio.setSfxEnabled(!audio.getSfxEnabled());
    showAudioSettings(inRun);
  });
  menuCard('BACK', 'to settings', () => showSettings(false, inRun));
}

// The four one-press display presets (E2's fast path): resolution + zoom
// applied together, so the common destinations are one press and the exact
// ladders stay one tap deeper for everything else.
const DISPLAY_PRESETS = [
  { name: 'AUTO',    res: 'AUTO',          zoom: 1 },
  { name: 'CRISP',   res: 'PIXEL-PERFECT', zoom: 1 },
  { name: 'BIGGER',  res: 'AUTO',          zoom: 2 },
  { name: 'BIGGEST', res: 'AUTO',          zoom: 4 },
];

// M1: ZOOM + RESOLUTION + TEXT HUD behind one DISPLAY door.
function showDisplaySettings(inRun = false) {
  openMenu(inRun ? 'settings' : 'menu');
  ovTitle.textContent = 'DISPLAY';
  ovTitle.className = '';
  ovSub.textContent = 'zoom, resolution & hud';
  const cur = DISPLAY_PRESETS.find(pr => pr.res === resMode() && pr.zoom === state.zoom);
  menuCard('DISPLAY PRESET', 'currently ' + (cur ? cur.name : 'CUSTOM') +
    ' (auto / crisp / bigger / biggest)', () => {
    const i = cur ? (DISPLAY_PRESETS.indexOf(cur) + 1) % DISPLAY_PRESETS.length : 0;
    const pr = DISPLAY_PRESETS[i];
    prefStorage.setItem(KEY_RESOLUTION, pr.res);
    setZoom(pr.zoom);
    fitCanvas();
    showDisplaySettings(inRun);
  });
  // WAVE-16: world zoom (1/2/3/4/6/8 ladder; +/- keys cycle it live in-run).
  menuCard('ZOOM', 'currently ' + state.zoom + 'x (1/2/3/4/6/8)', () => {
    cycleZoom(1);
    showDisplaySettings(inRun);
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
    showDisplaySettings(inRun);
  });
  // WAVE-12: the text HUD is opt-in (canvas chrome is the default readout).
  menuCard('TEXT HUD', 'currently ' + (hudTextEnabled() ? 'ON' : 'OFF'), () => {
    setHudTextEnabled(!hudTextEnabled());
    showDisplaySettings(inRun);
  });
  menuCard('BACK', 'to settings', () => showSettings(false, inRun));
}

// M3: EXPORT + IMPORT + RECOVERY + RESET behind one SAVE DATA door (title
// only). D2: ONE rescue slot is offered — RECOVERY FILE (PREVIOUS) is gone;
// the two-slot STORAGE write logic is untouched, only the older slot's card
// was removed.
function showSaveData() {
  openMenu('menu');
  ovTitle.textContent = 'SAVE DATA';
  ovTitle.className = '';
  ovSub.textContent = 'export, import & reset' + (saveNotice ? ' · ' + saveNotice : '');
  menuCard('EXPORT SAVE', 'download a .json backup of everything', () => {
    const done = (r) => {
      if (r && r.aborted) return;   // player cancelled the save dialog — say nothing
      saveNotice = r && r.ok ? 'SAVE EXPORTED.' : 'EXPORT FAILED — try again.';
      showSaveData();
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
      showSaveData();
    });
  }
  menuCard(resetArmed ? 'CONFIRM RESET?' : 'RESET PROFILE',
    resetArmed ? 'wipes gold, upgrades & unlocks' : 'twice to confirm',
    () => {
      if (!resetArmed) { resetArmed = true; showSaveData(); return; }
      profile = makeProfile();
      persistProfile();
      resetArmed = false;
      showSaveData();
    });
  menuCard('BACK', 'to settings', () => showSettings(false));
}

// ---------- Run flow: compose a run from the profile (meta.js header spec) --
function startRun() {
  // DRAFT PICK CEREMONY: a fresh run drops any live ceremony (RETRY while a
  // ceremony rides, etc.) — the run setup below owns the screen from here.
  if (draftCeremony) endDraftCeremony(false);
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
    applyCharacterUpgrades(
      applyCharacter(applyMetaBonuses(p.stats, profile.purchased), profile.equippedCharacter),
      profile, profile.equippedCharacter), []);
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
  // G25 slice 1: run-scoped apex stamps, read ONCE here through the meta.js
  // accessors (never the raw fields) — the weapons re-arm seam
  // (state.apexFire), the HUD flourish (state.apexMark) and the run-end mark
  // (state.apexRun) all read the stamps, so a menu-screen toggle never
  // rewrites a live run's history. All three default falsy, so a profile
  // without apex (every pre-slice save) plays byte-identically to before.
  state.apexRun = apexEnabled(profile);
  state.apexFire = state.apexRun && apexOwned(profile, 'apex_endless_fire');
  state.apexMark = state.apexRun && apexOwned(profile, 'apex_mark');
  // NIGHT MODE: the run-scoped stamp, frozen here (the apexRun pattern).
  state.nightRun = state.night === true;
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
  // S1 (audit 2026-09-16): the run-once settle guard re-arms with the run.
  state.runSettled = null;
  // M1: a boss-stance save left over from a run that ended mid-boss (or at the
  // maw victory) must not leak into this run's first boss approach.
  state.preBossStance = null;
  // M2: the previous run's last killer must not print on this run's death card.
  lastDamageSource = null;
  // AUDIT ROUND 2 (2026-09-16): run-boundary presentation state that used to
  // survive startRun. The meta-screen RETURN markers are mode snapshots a run
  // that ends inside a screen leaves behind — a stale settingsReturn could
  // resume the WRONG mode the next time that screen closed (it is read with a
  // `|| 'playing'` fallback, so a value from a MENU-context visit flips a
  // mid-run close back to the menu). rewriteEchoes is the rewrites.js echo
  // queue, likewise run-scoped. All start empty for every run; the guard test
  // (test_audit_round2.mjs) mechanically holds every one of these here.
  state.rewriteEchoes = [];
  // IN-RUN REFERENCE ACCESS: the reference door and the last end card are
  // run-scoped — a new run must not return GOT IT into the previous run's
  // death screen, nor recompose a settled payload.
  state.helpFrom = null;
  state.manualPage = null;
  state.endScreen = null;
  // HELP MODE: the inspect mode is player-armed and run-scoped — a new run
  // never starts with the UI inert, and no origin marker leaks between runs.
  state.helpMode = false;
  state.helpOrigin = null;
  // ONBOARDING REWORK: per-run hint/tag bookkeeping restarts with the run.
  resetOnboarding();
  state.apexReturn = null;
  state.bestiaryReturn = null;
  state.settingsReturn = null;
  state.statsReturn = null;
  state.trophiesReturn = null;
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
  state.runPurse = purseClamp(profile.runPurse);
  dilation.scale = 1;
  dilation.remaining = 0;
  // G31 (owner 2026-09-16): the run starts in the PERSISTED pilot choice
  // (applied through swapPilotMode — the controller binding, focus/stance
  // inheritance, held-input clearing, hint refresh and toast all behave as
  // they do for a mid-run toggle). The same-mode early return makes this a
  // no-op when the last run already ended in that mode. Absent/unrecognised
  // stored value -> AUTO_ALL, the fresh-player default.
  swapPilotMode(loadPilotPref());
  // NIGHT MODE: an unattended run must pilot itself — AUTO_ALL regardless of
  // the stored preference (the pref itself is untouched; the next normal run
  // re-reads it two lines up).
  if (state.nightRun) swapPilotMode('AUTO_ALL');
  // NIGHT MODE: no auto-advance timer survives a run boundary.
  nightContinueLeft = null;
  nightRestartLeft = null;
  nightEvolveLeft = null;
  clearPilotInput();
  // G31: the stance pref rides along (the boot apply already covers a
  // reload; this re-reads so storage edited between runs is honoured).
  applyStancePref();
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
  // S1 (owner directive 2026-09-14): world-seed the fixed set of 4 altars ONCE
  // here — uniform scatter over the whole arena, static for the whole run.
  state.shrines = seedShrines(state.shrineRng);
  state.shrine = state.shrines[0] || null;   // render/tour VIEW: first unused
  // M1 (C4/C5): the per-run atlas — created fresh here next to groundSeed,
  // never serialised. The ONE landmark source wired this slice is S1's
  // world-seeded shrines: their positions are READ from the set above and
  // registered ONCE (no re-roll, no mirrored placement constants, no
  // per-frame registration).
  state.atlas = createAtlas(C.GROUND.RIM, C.ATLAS.MAP_CELL);
  for (const sh of state.shrines) {
    atlasRegisterLandmark(state.atlas, { kind: 'shrine', x: sh.x, y: sh.y });
  }
  state.mapOpen = false;                     // C6: every run boots map-CLOSED
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
  // G26 PRE-RUN LOADOUT: a stored choice (chosenLoadout — validated against
  // the LIVE unlock set and this run's slot count, never the menu's own
  // bookkeeping) IS the kit. With NO choice the run arms exactly the starting
  // kit a fresh account has today (the zero-penalty contract): the character's
  // starting weapon when unlocked, nothing else. openDraft offers no wpn_*
  // grants, so what starts here is what the whole run carries.
  const loadout = chosenLoadout();
  if (loadout) {
    for (const t of loadout) state.weapons.push(makeWeapon(t));
  } else if (ch.startingWeapon && weaponUnlocked(profile, ch.startingWeapon)) {
    // WAVE-11: character starting weapons ride the SAME unlock gate as the
    // loadout (meta.js retroactively reset old saves to the starter set, so
    // a WITCH save that never bought ZAP must not spawn with it).
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
  state.magnetSnap = null;   // RSS8: a fresh run owes no sweep total
  state.bossSweepSnap = null; // ARENA SCALE-UP: ditto the boss-clear sweep's total
  state.chests = [];
  state.items = [];
  state.arches = [];
  state.archBuffs = [];
  state.shieldAbsorbs = 0;
  state.killRateEwma = 0;   // G33: fresh estimator per run
  state.killsAtRateTick = 0;
  // G34/G36: the shared heal budget starts each run FULL (one second's
  // budget), so a first-second burst with lifesteal or harvest heals exactly
  // as it did pre-cap.
  state.healBudget = C.HEAL_BUDGET.CAP_FRAC * p.stats.maxHp;
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
  // FIRST-RUN PROLOGUE (owner 2026-09-18, walking version): run #1 of a
  // FRESH profile — derived from the existing counter
  // (achievements.totals.runs at startRun; recordRun bumps it at run END, so
  // it reads 0/absent through run #1) — opens INERT: no spawns, the clock
  // frozen, a shimmering potion on screen 100wu above the spawn. NO new
  // saved field. Absent counts as 0: the sanitized save keeps totals SPARSE
  // ({} on a fresh profile), and a player who has settled even one run
  // carries runs >= 1 — so absent really does mean "never finished a run".
  state.prologueShieldT = 0;
  const prologueRunsPlayed = Number(profile.achievements && profile.achievements.totals &&
    profile.achievements.totals.runs) || 0;
  // ADDENDUM (owner 2026-09-17, "one off run just like new players"): a
  // RETURNING player converting on a marked release arms the SAME prologue a
  // fresh profile gets — keyed off lastSeenUpdate (see veteranIntroDueFor),
  // never a second saved field. The arm CONSUMES the one-off right here:
  // clearing lastSeenUpdate and persisting means this run — the one that
  // opened with the tutorial — is the whole offer; no later run re-arms it
  // (the persist also stamps lastPlayed, which closes the note's date gate).
  const veteranIntro = veteranIntroDueFor(profile, WHATS_NEW, bootResult.status === 'fresh');
  state.prologue = (prologueRunsPlayed === 0 || veteranIntro)
    ? { t: 0, drunk: false, walkT: 0,
        // STAGED INTRODUCTION (owner 2026-09-18: "introduce the buttons one
        // at a time with the tooltip explaining what they do"): each staged
        // control is hidden until its banner's OK, revealed with a tooltip,
        // and live from that moment (see PROLOGUE_STAGES below).
        revealed: { move: false, pilot: false, stats: false }, tip: null,
        // SKIPPED (owner 2026-09-18: "No, potion exists for the skipped
        // tutorial too"): a skip is "stop explaining", NOT "start the run
        // instantly" — the phase STAYS ARMED in skipped mode (banners and
        // tooltips gone, the FULL control set live, the potion sequence
        // running as normal) until the drink or the bound ends it.
        skipped: false,
        // Side placement (up-RIGHT, clamped on-screen): the straight-up
        // potion hid BEHIND banner #1's card plate (x 90..390, y 24..116) —
        // see the POTION_DX comment in config.js.
        potion: {
          x: Math.min(C.VIEW_W - 30, Math.max(30, p.x + C.PROLOGUE.POTION_DX)),
          y: Math.min(C.VIEW_H - 40, Math.max(40, p.y + C.PROLOGUE.POTION_DY)),
        },
        bannerIdx: 0, banners: PROLOGUE_BANNERS }
    : null;
  state.prologueRan = !!state.prologue;
  // PROLOGUE ADDENDUM (owner 2026-09-18: "all buttons should be disabled
  // during this initial period"): the body class is the DOM half of the lock
  // (index.html greys the whole #touch layer out and pulls its pointer
  // events); the logic half is the runAction/keydown gates. Run #2+ never
  // arms it — and an explicit OFF here clears any stale class.
  prologueLockButtons(!!state.prologue);
  if (state.prologue) {
    // A re-armed phase starts STAGE-CLEAN: no leftover .pr-on marks, no
    // leftover tooltip (endPrologue sweeps both, but a re-arm within one
    // session — the test harness's back-to-back arms — must not inherit
    // the previous arm's staging state either).
    prologueTipHide();
    for (const s of PROLOGUE_STAGES) {
      for (const id of s.btns) {
        const el = typeof document !== 'undefined' && document.getElementById(id);
        if (el && el.classList) el.classList.remove('pr-on');
      }
    }
  }
  // The one-off is SPENT at the arm (addendum 2026-09-17): the guided run is
  // happening right now, so the offer comes off the table in the same breath.
  // Clearing lastSeenUpdate + persisting (which stamps lastPlayed past the
  // release date) closes BOTH re-arm paths — the veteran gate and the note's
  // date gate — through the ONE existing save path. No second writer.
  if (veteranIntro) {
    profile.lastSeenUpdate = null;
    persistProfile();
  }
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

// ---------- FIRST-RUN PROLOGUE (owner 2026-09-18) -----------------------------
// "It should be a potion seen on screen and the pilot walks towards it. It
// could be a controlled sequence where no enemies spawn and the timer hasn't
// started. We can even use this time to have dismissible (with an ok button)
// banners explaining some of the basics of the game."
//
// The banners: at most four, one at a time, each short and plain. They are
// CANVAS-drawn with an OK hit-region on the canvas pointer path — the ONLY
// live control of the phase (everything else is locked, see prologueLockButtons
// and the runAction gate). ADDENDUM (owner 2026-09-18: the pilot PAUSES for
// banners — the withdrawn "the pilot can keep walking" line): a banner goes up
// only after C.PROLOGUE.BANNER_WALK_S of unpaused walking since the last OK,
// and while one is up the pilot holds position and BOTH prologue clocks freeze.
// Copy rule (the player review's ask): state what the thing IS or what you GET.
// No emojis (house rule). Numbers ride the named constant so the copy can never lie.
const PROLOGUE_BANNERS = [
  { title: 'MOVE', body: 'Drag anywhere on the field, or use WASD or the arrow keys. You walk where you point.' },
  { title: 'POTIONS', body: 'Red refills health, blue refills mana. Walk over one to drink it.' },
  { title: 'LEVEL UP', body: 'Gems fill the bar at the top of the screen. Each level offers a draft: pick 1 of 3 upgrades.' },
  { title: 'THE POTION', body: 'The shimmering potion ahead is free. Drink it for ' +
    C.PROLOGUE.INVULN_S + ' seconds of shielding and a clear field.' },
];

function prologueBanner() {
  if (!state.prologue || state.prologue.drunk) return null;
  if (state.prologue.skipped) return null;   // a skip stops the explaining
  if (state.prologue.bannerIdx >= PROLOGUE_BANNERS.length) return null;
  // The cadence gate: up only after BANNER_WALK_S of walking since the last
  // OK (walk -> banner -> OK -> walk ... -> potion). While below it there is
  // no banner on screen and the pilot is free to walk.
  return state.prologue.walkT >= C.PROLOGUE.BANNER_WALK_S
    ? PROLOGUE_BANNERS[state.prologue.bannerIdx] : null;
}

// OK (button tap or the seam): advance — the phase's SINGLE live control.
// Gated on a banner actually being up (the canvas hit-region is drawn only
// then; the seam matches). OK resets the walk clock, so the next banner
// waits for its own stretch of walking.
function prologueOk() {
  if (prologueBanner()) {
    state.prologue.bannerIdx++;
    state.prologue.walkT = 0;
    prologueReveal();
  }
}

// The drink. Invincibility (named constant), the on-screen clear THROUGH the
// normal death pass (normal drops, normal credit — hp=0, the enemies loop at
// the bottom of update() reaps), then the phase ends. The clear fires AT the
// drink, i.e. BEFORE the shield ends, trivially. On-screen = the visible
// field at the current zoom plus CLEAR_MARGIN world units — NOT the arena.
function prologueDrink(p) {
  if (!state.prologue || state.prologue.drunk) return;
  state.prologue.drunk = true;
  p.invuln = Math.max(p.invuln, C.PROLOGUE.INVULN_S);
  state.prologueShieldT = C.PROLOGUE.INVULN_S;
  const Z = zoomScale(state.zoom);
  const m = C.PROLOGUE.CLEAR_MARGIN;
  const x0 = state.cam.x - m, x1 = state.cam.x + C.VIEW_W / Z + m;
  const y0 = state.cam.y - m, y1 = state.cam.y + C.VIEW_H / Z + m;
  for (const e of state.enemies) {
    if (e.hp > 0 && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) e.hp = 0;
  }
  endPrologue('drunk');
}

// THE BOUND: the phase ends when the potion is drunk OR at MAX_S of UNPAUSED
// time (addendum 2026-09-18: a held banner freezes the bound's clock, so the
// lesson is never rushed — the OK button is the only way past a banner, like
// any menu). ONBOARDING ABSORB: the prologue taught the entry basics, so
// the stage-2 coachmark flags are marked seen HERE (run #1 never stacks a
// second onboarding path); REPLAY TOUR in settings re-arms them deliberately
// and the non-modal HintStrip is untouched (it resumes after the phase).
function endPrologue(why) {
  if (!state.prologue) return;
  state.prologueRan = true;
  state.prologue = null;
  prologueLockButtons(false);
  // STAGED INTRODUCTION close-out — THE GUARD THAT MATTERS MOST: at phase
  // end the control set is EXACTLY a normal run's. The body class lift
  // restores every hidden button; this sweep drops the staged .pr-on marks
  // and the tooltip, so nothing of the staging survives into the run. A
  // control that never came back would be this feature's worst failure.
  prologueTipHide();
  for (const s of PROLOGUE_STAGES) {
    for (const id of s.btns) {
      const el = typeof document !== 'undefined' && document.getElementById(id);
      if (el && el.classList) el.classList.remove('pr-on');
    }
  }
  for (const k of Object.values(TOUR_KEYS)) setTourFlag(k, true);
  toast(why === 'drunk' ? 'SHIELDED ' + C.PROLOGUE.INVULN_S + 'S'
    : why === 'skip' ? 'TUTORIAL SKIPPED - THE RUN BEGINS'
    : 'THE RUN BEGINS');
}

// The DOM half of the all-buttons-disabled lock (owner 2026-09-18): body class
// `prologue-locked` — index.html greys the whole touch layer out (opacity 0.35)
// and pulls its pointer events, an OBVIOUS disabled read that flips to full
// opacity the moment the phase ends. Nothing else re-enables early: the class
// is set ONLY at prologue arm time and cleared ONLY here.
function prologueLockButtons(on) {
  const body = typeof document !== 'undefined' && document.body;
  if (body && body.classList) {
    if (on) body.classList.add('prologue-locked');
    else body.classList.remove('prologue-locked');
  }
}

// ---------- PROLOGUE STAGED INTRODUCTION (owner 2026-09-18) --------------------
// "If we hide the controls, then we would need to introduce the buttons one
// at a time with the tooltip explaining what they do." The set and the order
// answer ONE question — what does a player need in the first 60 seconds?
//   1. MOVE (banner 1): without steering nothing else matters; the control is
//      the FLOATING STICK / WASD (the joystick task's settled outcome — the
//      floating stick with the home band IS the shipped movement control, so
//      nothing revealed here is about to be replaced). No DOM button: the
//      field itself; the tooltip floats over the stick's home band.
//   2. PILOT (banner 2): the fresh default is AUTO_ALL — the highest-value
//      fact the pads carry in the first minute is that the player can take
//      the controls over.
//   3. STATS (banner 3, beside LEVEL UP): the field report is where the
//      level-up's numbers live; it opens read-only and pauses nothing that
//      matters in an inert phase.
// Banner 4 (THE POTION) reveals nothing — the potion is the finale. The cog
// row / skills / potions are NEVER staged: in the first 60 seconds they are
// either empty (no skills drafted, full HP), replaced by banners, or
// settings-shaped — the hint layer introduces them post-run at their own
// first-matter moments.
const PROLOGUE_STAGES = [
  { kind: 'move', afterBanner: 1, btns: [] },
  { kind: 'pilot', afterBanner: 2, btns: ['tc-pilotbtn'] },
  { kind: 'stats', afterBanner: 3, btns: ['tc-stats'] },
];

// The reveal: called from prologueOk — after OK of banner N, stage N's
// control appears (its button un-hides via .pr-on) with its tooltip. The
// logic gates (runAction / keydown / movement) read `revealed`, so the
// control is live the same instant it becomes visible.
function prologueReveal() {
  const pr = state.prologue;
  if (!pr) return;
  for (const s of PROLOGUE_STAGES) {
    if (pr.bannerIdx >= s.afterBanner && !pr.revealed[s.kind]) {
      pr.revealed[s.kind] = true;
      for (const id of s.btns) {
        const el = typeof document !== 'undefined' && document.getElementById(id);
        if (el && el.classList) el.classList.add('pr-on');
      }
      prologueTipShow(s.kind);
    }
  }
}

// The tooltip: appears WITH its control, points at it, and DISAPPEARS WHEN
// THE CONTROL IS USED (learn by doing — never an OK press). Texts come from
// controls_ref's own rows where a control exists (no forked strings); MOVE
// is prologue-only copy because it introduces the field, not a button.
function prologueTipText(kind) {
  const touch = isTouchPath();
  if (kind === 'move') return touch
    ? 'DRAG ANYWHERE TO STEER - try it now'
    : 'WASD OR ARROWS TO STEER - try it now';
  if (kind === 'pilot') return introLine('pilot', touch);
  if (kind === 'stats') return introLine('stats', touch);
  return '';
}
function prologueTipShow(kind) {
  if (state.prologue) state.prologue.tip = kind;
  const el = typeof document !== 'undefined' && document.getElementById('prologue-tip');
  if (el) {
    el.className = 'tip-' + kind;
    el.textContent = prologueTipText(kind);
    el.hidden = false;
  }
}
// Used = learned. Called from every live seam of a staged control (the
// movement override, runAction's allow path, the keydown twins).
function prologueTipUsed(kind) {
  const pr = state.prologue;
  if (!pr || pr.tip !== kind) return;
  pr.tip = null;
  const el = typeof document !== 'undefined' && document.getElementById('prologue-tip');
  if (el) el.hidden = true;
}
function prologueTipHide() {
  const pr = state.prologue;
  if (pr) pr.tip = null;
  const el = typeof document !== 'undefined' && document.getElementById('prologue-tip');
  if (el) el.hidden = true;
}

// The staged-act gate: through the phase ONLY the revealed controls' actions
// pass runAction (everything else stays inert — the owner's all-buttons-
// disabled rule, now with the staged exceptions). A SKIPPED phase is fully
// live: the skip restores the whole control set at the press.
function prologueActAllowed(act) {
  if (!state.prologue || state.prologue.skipped) return true;
  const rv = state.prologue.revealed || {};
  if (act === 'pilot' && rv.pilot) return true;
  if (act === 'stats' && rv.stats) return true;
  return false;
}

// The manual steering vector during the phase (the MOVE stage): the revealed
// input wins over the choreography's walk for as long as it is held — in ANY
// pilot mode (the drag/keys ARE the lesson). The moment it goes non-zero the
// MOVE tooltip is done: used means learned.
function prologueManualVec() {
  const pr = state.prologue;
  if (!pr || pr.drunk || !pr.revealed || !pr.revealed.move) return null;
  const i = pilotInput || {};
  let mx = 0, my = 0;
  const mag = Math.min(1, Math.max(0, i.mag || 0));
  if (mag > 0.15) {   // the stick's dead zone (controllers.js JOY_DEAD_ZONE)
    const len = Math.hypot(i.x || 0, i.y || 0) || 1;
    mx = ((i.x || 0) / len) * mag;
    my = ((i.y || 0) / len) * mag;
  } else {
    mx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    my = (i.down ? 1 : 0) - (i.up ? 1 : 0);
    if (mx !== 0 && my !== 0) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
  }
  if (mx === 0 && my === 0) return null;
  prologueTipUsed('move');
  return { x: mx, y: my };
}

// SKIP ALL — APPROVED by the owner 2026-09-18 as the second enabled
// exception alongside OK (during the prologue exactly two controls are live:
// the banner's OK and this). CLARIFIED 2026-09-18 ("No, potion exists for
// the skipped tutorial too"): the skip removes the EXPLANATIONS, not the
// SEQUENCE — "stop explaining", NOT "start the run instantly". It sets the
// skipped mode: no banner and no tooltip will ever appear again, the FULL
// control set is live from the press, and the POTION SEQUENCE RUNS AS
// NORMAL (the AUTO pilot walks to the visible potion, drinks it, gets the
// 45s invuln + the clearing pulse — or the MANUAL fallback walk carries an
// idle pilot; the un-walked potion still answers to MAX_S). endPrologue at
// the drink is the phase's end, unchanged. The tour skip's session
// suppression is reused (hintsSuppressed — no chips at a player who opted
// out; REPLAY TOUR is the way back in).
function prologueSkip() {
  const pr = state.prologue;
  if (!pr || pr.drunk || pr.skipped) return;
  hintsSuppressed = true;
  pr.skipped = true;
  // Nothing left to introduce: every control is already live.
  pr.revealed.move = pr.revealed.pilot = pr.revealed.stats = true;
  prologueLockButtons(false);
  prologueTipHide();
  for (const s of PROLOGUE_STAGES) {
    for (const id of s.btns) {
      const el = typeof document !== 'undefined' && document.getElementById(id);
      if (el && el.classList) el.classList.remove('pr-on');
    }
  }
  toast('TUTORIAL SKIPPED');
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
  controlUsed('stats');   // PER-CONTROL INTRODUCTIONS: opened = learned
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
  saveStancePref(s);   // G31: the stance choice persists between runs
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

// RSS8: does THIS run hold the Magnet Collector card? Run-local flag on the
// player's skills bag (the Frost Nova card's pattern), read by the manual
// act, the auto-cast gate and the touch button's visibility — one definition.
function magnetHeld(st) {
  const q = st && st.player;
  return !!(q && q.skills && q.skills.magnet);
}

function runAction(act) {
  // PROLOGUE ADDENDUM (owner 2026-09-18): through the first-run phase every
  // button is inert EXCEPT the staged introductions — the controls already
  // revealed by their banner's OK (prologueActAllowed: PILOT after banner 2,
  // STATS after banner 3). Using a staged control retires its tooltip (used
  // means learned). The banner's own OK and SKIP live on the canvas pointer
  // path, not this seam.
  if (state.prologue && !prologueActAllowed(act)) return;
  if (state.prologue && (act === 'pilot' || act === 'stats')) prologueTipUsed(act);
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
  // WAVE-22c -> HELP MODE (2026-09-16): the "?" button arms / leaves the
  // tap-to-learn inspect mode (the key-list panel is retired). Pressing "?"
  // IS the demonstration, same as before.
  if (act === 'help') {
    controlUsed('help');
    if (state.helpMode) leaveHelpMode(); else enterHelpMode();
    return;
  }
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
  // M1: the MAP touch button — same mid-run-only gate (C6). The sim keeps
  // running while the map is open (C1), so opening it mid-swarm is a risk
  // the player takes, never a pause.
  if (act === 'map') {
    if (state.mode === 'playing' || state.mode === 'finale') toggleMap();
    return;
  }
  // Skills/potions/doctrine stay live through the finale (WAVE-10).
  if (state.mode !== 'playing' && state.mode !== 'finale') return;
  // PER-CONTROL INTRODUCTIONS: this is the MANUAL action seam (key or touch
  // button — the AUTOPILOT casts/drinks through other paths and never
  // retires a hint), so every act here is a demonstration.
  if (act === 'focus') { controlUsed('focus'); controller.cycleFocus(); }
  else if (act === 'stance') { controlUsed('stance'); cycleStanceWithFeedback(); }
  else if (act === 'q') {
    controlUsed('skill-q');
    // E2 (R9): ground-AoE casts can't touch flyers (see flyingGuard); the
    // Witch's chain beam is a DIRECT hit — its damage lands, only the
    // frost-slow rider is refused ('beam').
    const qid = classSkillId(state);
    flyingGuard(qid === 'CHAIN_REACTION' ? 'beam' : 'blast', () => useSkill(state, qid));
  }
  else if (act === 'w') { controlUsed('skill-w'); useSkill(state, 'OVERCHARGE'); }
  // RSS8 MAGNET COLLECTOR: the card-granted skill's MANUAL act (X key / the
  // MAG touch button). Gated on the run HOLDING the card — without it the act
  // is a no-op (the def exists in C.SKILLS regardless, like FROST_NOVA).
  else if (act === 'magnet') {
    if (magnetHeld(state)) { controlUsed('skill-magnet'); useSkill(state, 'MAGNET_PULL'); }
  }
  else if (act === 'h') { controlUsed('potion-hp'); drinkHealthPotion(state); }
  else if (act === 'n') { controlUsed('potion-mp'); drinkManaPotion(state); }
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
//   * strictly BELOW the line, never at or above it, and never with an empty
//     count — no charge is burned at the boundary. The HP line is THE POTION'S
//     HEAL VALUE (owner 2026-09-17, msg_01M2RE1V: "If HP drops below what a
//     potion would heal, it should be used" — "In auto mode that is"):
//     C.POTIONS.HP_HEAL x the SAME healMult drinkHealthPotion applies (Alchemy
//     potionPower + choice potionHealMult), so the trigger and the drink can
//     never disagree on what a potion is worth. The old 0.35-of-max gate sat
//     far above any lethal dip on a big pool, so the pilot hoarded its whole
//     stack and died rich. The MP line stays max * MP_FRACTION (+ a starved
//     skill) — mana restores a COOLDOWN economy, not a heal.
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
  // POTION TUNE 2026-09-17: the HP trigger is the potion's heal value — the
  // SAME healMult the drink itself applies (Alchemy + choices), computed here
  // from the same expression drinkHealthPotion uses, so the threshold tracks
  // every potion-heal modifier the drink does. Nominal heal (pre boss-curse):
  // the curse taxes the heal, not the trigger.
  const healMult = ((p.choices && p.choices.potionHealMult) || 1) * (p.stats.potionPower || 1);
  if (ad.hp === 0 && p.potions.hp > 0 && p.hp < C.POTIONS.HP_HEAL * healMult) {
    if (drinkHealthPotion(state)) ad.hp = d.COOLDOWN;
  }
  if (ad.mp === 0 && p.potions.mp > 0 && p.mana < p.stats.maxMana * d.MP_FRACTION) {
    const starved = Object.keys(C.SKILLS).some(id => {
      // N1 slice 3: a def that carries no MANA key never waits on the pool,
      // so it must not count as "starved" (skillManaCost would read NaN).
      // 2026-09-17: the three ults now DO carry MANA — a CHARGED ult the
      // pool cannot afford is a skill genuinely waiting on mana, same as
      // Q/W. An UNCHARGED ult waits on KILLS, not the pool: without this
      // gate the AUTO pilot burns a mana potion every time the pool dips
      // early in a run, for a cast that cannot fire anyway.
      if (C.SKILLS[id].MANA == null) return false;
      if (C.SKILLS[id].KILLS != null) {
        const u = ultCharge(state, id);
        return u.cooldown <= 0 && u.charge >= u.need && p.mana < u.manaCost;
      }
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
//     and ZAP's hard gate holds at cd 0 if a cast drained it, so the next
//     funded tick fires the bolt).
function autoCastSkills(state) {
  if (!pilotAssistsYou()) return;
  const ac = C.AUTOPILOT.AUTO_CAST;
  if (!ac || !ac.ENABLED) return;
  const p = state.player;
  // The Q slot (N1a classSkillId — the ONE place a class's skill id is read).
  // FROST_NOVA gates on its RADIUS; a Q skill without one (the Witch's
  // CHAIN_REACTION — an aimed chain) falls back to "any live enemy" rather
  // than a blind cast. N1 slice 3 + 2026-09-17: an ult's readiness is charge
  // + the cooldown floor + the mana price (all inside ultCharge.ready);
  // CONSECRATION is PLACED at the densest
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
    if (lands) {
      // E2 (R9): same flying exemption as the manual cast seam — ground AoE
      // is refused, the chain beam's direct damage still lands.
      flyingGuard(q === 'CHAIN_REACTION' ? 'beam' : 'blast', () => useSkill(state, q));
    }
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
  // RSS8 MAGNET COLLECTOR: the AUTO policy — the parity rule in the other
  // direction (an ability the player has must have an auto policy). A pure
  // FLOOR-VALUE gate: fire when that many drops are outstanding, never on a
  // timer, so the pilot banks the field exactly when the field is worth
  // banking. MANA 0, so the pool check is vacuous but kept for symmetry.
  if (magnetHeld(state) && (p.skillCd.MAGNET_PULL || 0) <= 0 &&
      p.mana >= skillManaCost('MAGNET_PULL', state)) {
    const floor = state.gems.length + state.drops.length + state.itemDrops.length;
    if (floor >= C.MAGNET.AUTO_MIN) useSkill(state, 'MAGNET_PULL');
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
  'o',                   // pilot toggle (was M before M1 claimed M for the map)
  'm',                   // M1 map toggle
  'r',                   // A2 radar toggle
  'i', '?', 'f1',         // stats overlay + hints toggle
  's',                    // held "down" in MANUAL — swallow ONLY its repeat
  '+', '=', '-', '_',    // zoom ladder
  // M4 (audit 2026-09-16): the overlay card keys. The intermission maps 1-4
  // to card.click() — an OS auto-repeat tail re-fired the click ~30x/s and
  // held-key purchases drained the purse one paid chest at a time. Honest
  // taps are single presses by construction; repeats are never honest.
  '1', '2', '3', '4',    // overlay card picks (draft/evolve/intermission)
  'c', 'enter',          // intermission CONTINUE (idempotent, but repeat-clean)
]);

window.addEventListener('keydown', (ev) => {
  audioUnlockGesture();   // S2: a keydown IS a user gesture — unlock audio
  // FULLSCREEN: a key is an interaction — but an OS auto-REPEAT is not a new
  // interaction (guard 2026-09-18): at HIDE_S 1.3 a held movement key's
  // ~30/s repeat tail would re-bump the window forever and pin the transient
  // chrome on screen during play. One show per interaction, then it fades.
  if (!ev.repeat) fsBump();
  // While a tour is live the keys are the TOUR's: Right/Enter/Space advance,
  // Left backs, Escape skips (the tour's own document-level handler, which
  // fires before this one). Everything else must NOT reach the game — the
  // same press firing a skill or toggling the pilot under a paused coachmark
  // is exactly the "goes away too easily / without context" complaint.
  if (coachActive()) return;
  const k = ev.key.toLowerCase();
  if (ev.repeat && REPEAT_GUARDED.has(k)) return;
  // FULLSCREEN (addendum guard): Escape always leaves immersive mode — an
  // immersive mode with no way out is a trap. Native fullscreen exits with
  // Escape by the browser's own default; this is the fallback's mirror.
  if (k === 'escape' && immersiveOn) { applyImmersive(false); return; }
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
  if (state.mode === 'death-cine') {                    // G15: any key skips
    // Same contract as the other movies: the guard eats the tap tail so the
    // skipping gesture cannot also press the RETRY card waiting underneath.
    if (C.CINE.SKIPPABLE) {
      if (ev.preventDefault) ev.preventDefault();
      uiGuard.arm();
      endDeathCine();
    }
    return;
  }
  // HELP MODE (owner 2026-09-16): '?' arms / leaves the tap-to-learn mode on
  // every screen it can serve — desktop included, which is where the old
  // key-list panel made "?" look broken. While the mode is up, every other
  // key is INERT (a key must never fire what the player is trying to read
  // about) except ESC, which also leaves. This gate sits before the mode
  // dispatch so no mode branch can bypass it.
  if ((ev.key === '?' || k === 'f1') && !(state.prologue && !state.prologue.skipped)) {
    if (ev.preventDefault) ev.preventDefault();
    controlUsed('help');
    if (state.helpMode) leaveHelpMode(); else enterHelpMode();
    return;
  }
  if (state.helpMode) {
    if (k === 'escape') {
      if (ev.preventDefault) ev.preventDefault();
      leaveHelpMode();
    } else if (ev.preventDefault) ev.preventDefault();
    return;
  }
  // MANUAL v2: while the paginated reference is open (any door — title,
  // first-run gate, in-run pause, end screen), the arrows turn pages. Key
  // parity with the PREV/NEXT cards; the ends are no-ops (the cards dim).
  if (state.manualPage !== null) {
    if (k === 'arrowleft') { manualPrev(); return; }
    if (k === 'arrowright') { manualNext(); return; }
  }
  // SHOP PAGING (desktop addendum: "DESKTOP HAS NO SWIPE: ... add keyboard
  // arrow-key paging (left/right)"): while the paged shop is the live menu
  // screen, the arrows turn pages — parity with the edge arrows and swipe.
  if (shopPagerActive()) {
    if (k === 'arrowleft') { shopPageGoto(shopPager.page - 1); return; }
    if (k === 'arrowright') { shopPageGoto(shopPager.page + 1); return; }
  }
  if (state.mode === 'escape') {                        // V1: the mode's own keys
    // The escape owns its input surface (arrows/AD run, space/W/up jump,
    // shift/X dash, ESC skips) — never the overhead skill/potion paths.
    if (ev.preventDefault) ev.preventDefault();
    ESCAPE.onKey(ev.key, true);
    return;
  }
  if (state.mode === 'draft') {
    if (['1', '2', '3', '4'].includes(ev.key)) {
      // 1-4: the W7b Full Hand mythic adds a fourth offer, and its card carries
      // a [4] key hint — the routing must cover what the markup promises. These
      // are the ONE-PRESS quick-pick (test_w7b_draft_ladder pins a single [4]
      // press taking the offer), and since 2026-09-15 they match the pointer
      // path exactly: one activation takes the card, no confirm step.
      const card = ovCards.children[Number(ev.key) - 1];
      if (card && card._draftOffer) pick(card._draftOffer);
    } else if (k === 'arrowleft' || k === 'arrowup') {
      draftFocusStep(-1);
    } else if (k === 'arrowright' || k === 'arrowdown') {
      draftFocusStep(1);
    } else if (k === 'enter' || k === ' ') {
      // Keyboard parity with the tap: Enter on the cursor card TAKES it in one
      // press. (The former second-press confirm was retired with the inspect
      // box — see activateDraftCard.)
      const card = ovCards.children[draftFocus >= 0 ? draftFocus : 0];
      if (card && card._draftOffer) activateDraftCard(card._draftOffer);
    }
    // ESC is deliberately NOT handled here: with no confirm step there is no
    // intermediate state to back out of, and the offer must not be dismissible
    // (skipping a draft is not a thing the game offers).
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
  } else if (state.mode === 'apex') {
    // G25 slice 2 APEX GALLERY: the trophy gallery's exact key contract —
    // ESC backs out (to the apex panel, what BACK promises; the panel is the
    // only door in) and the arrows walk the ring the PREV/NEXT cards step.
    if (k === 'escape') { closeApexGallery(); showApexShop(); }
    else if (k === 'arrowleft') apexStep(-1);
    else if (k === 'arrowright') apexStep(1);
  } else if ((state.mode === 'menu' || state.mode === 'farewell' || state.mode === 'characters'
      || state.mode === 'loadout') && k === 'escape') {
    // IN-RUN REFERENCE ACCESS: the reference opened from an END screen backs
    // out to that screen, not to the title (return-to-origin discipline).
    if (state.helpFrom === 'end') { state.helpFrom = null; reshowEndScreen(); return; }
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
    // PROLOGUE ADDENDUM: no in-run keys through the phase EXCEPT the staged
    // introductions — the revealed controls' key twins are live (MOVE: WASD/
    // arrows steer the phase in any pilot mode; PILOT: O; STATS: I — each
    // use retires its tooltip), and ESC while a banner is up is SKIP (the
    // tour's own skip idiom, proposed as the second enabled exception).
    // runAction carries the same staging gate; the banners' OK and SKIP are
    // the canvas-path controls.
    if (state.prologue && !state.prologue.skipped) {
      const rv = state.prologue.revealed || {};
      if (prologueBanner() && k === 'escape') { prologueSkip(); return; }
      if (rv.move) {
        const dir = KEY_DIRS[k];
        if (dir) { pilotInput[dir] = true; return; }
      }
      if (rv.pilot && k === 'o') { togglePilotMode(); return; }
      if (rv.stats && k === 'i') { runAction('stats'); return; }
      return;
    }
    // WAVE-23 FIX (desktop audit #2): a keyboard-only player had NO pause.
    // ESC was routed only in menu/settings/stats, and the in-run settings
    // screen (the game's only pause) opened solely from the mouse-only cog.
    // ESC and P now open the same pause; the 'settings' branch above still
    // owns ESC-to-resume, so ESC is a clean toggle.
    if (k === 'escape' || k === 'p') { openSettings(); return; }
    // NOTE (wave-25): the auto-repeat guard for held action keys (tab/g/h/n and
    // the rest) now lives at the top of this handler; see REPEAT_GUARDED.
    // WAVE-13 MANUAL PILOT. Key scheme (documented in the hint line):
    //   O          toggle AUTO/MANUAL (any mode-pair, mid-run)
    //   M          the per-run MAP (M1) — M used to be the pilot toggle; the
    //              brief for the map claims M, so the pilot moved to O (free
    //              in-run, off the WASD cluster). Dispatch msg_01M2H0ZEDG.
    //   arrows/WASD held movement — MANUAL only
    //   S          'down' — MOVEMENT ONLY, in EVERY mode (owner rule). S used
    //              to open the FIELD REPORT in AUTO, which is the DEFAULT mode:
    //              a player driving with WASD hit S to walk down and got a menu
    //              instead. Nothing else claims S now.
    //   I          FIELD REPORT — the ONE stats key, in BOTH modes
    //   W          Overcharge in AUTO · 'up' in MANUAL — E fires Overcharge
    //              in BOTH modes (the permanent new home for it)
    if (k === 'o') { togglePilotMode(); return; }
    // M1: M toggles the per-run map in BOTH pilot modes (a HUD readout like
    // the radar — never a pause, the sim keeps running under it).
    if (k === 'm') { toggleMap(); return; }
    if (k === 'i') { openStats(); return; }
    // A2: R toggles the radar in BOTH pilot modes (it is a HUD readout, not
    // a movement key — no conflict with WASD).
    if (k === 'r') { toggleRadar(); return; }
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
      [C.SKILLS.MAGNET_PULL.KEY]: 'magnet',   // RSS8: a no-op unless the run holds the card
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
// V1: the escape owns its held-key state (its own movement layer) — route the
// keyup there too so a manual runner never ghost-runs past the hand-back.
window.addEventListener('keyup', (ev) => {
  if (state.mode === 'escape') ESCAPE.onKey(ev.key, false);
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
for (const id of ['tc-focus', 'tc-stance', 'tc-pilot', 'tc-q', 'tc-w', 'tc-h', 'tc-n', 'tc-radar', 'tc-map', 'tc-magnet', 'tc-mag']) {
  touchEls[id] = document.getElementById(id);
}

// Reveal the layer on touch devices (CSS @media (pointer: coarse) covers
// most; this catches the rest, e.g. hybrid laptops). WAVE-22b: non-touch
// devices get COG-ONLY — the settings cog is the in-run menu button and
// desktop must reach it with a mouse too.
// DEVICE (2026-09-16): a coarse pointer with NO touch events used to fall
// through to 'cog-only' here while the CSS coarse media still revealed the
// on-screen pads — those users saw touch controls and were taught key
// names. The class write now honours the SAME signal the CSS reads, so
// isTouchPath() is true whenever the touch layer is actually visible.
const coarsePointer = !!(typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches);
const hasTouch = ('ontouchstart' in window) ||
  ((typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) || 0) > 0 ||
  coarsePointer;
if (touchLayer && touchLayer.classList) {
  touchLayer.classList.add(hasTouch ? 'on' : 'cog-only');
}

// ---------- HELP MODE (owner 2026-09-16, two briefs, one behaviour) ----------
// "?" does ONE thing on BOTH input paths: it arms a quiet inspect mode
// ("tap a control to learn what it does"). The old WAVE-22c panel — a
// four-line key list under the cog — is RETIRED: the list belongs to the
// reference's KEYBOARD page (which reads the same HINT_LINES table below),
// not to "?". While the mode is up, every input funnel intercepts: touch
// taps, overlay-card clicks and gameplay keys EXPLAIN what they touch
// instead of activating it, the sim is paused by the player's own
// invitation (that is what makes the pause acceptable), and leaving returns
// to exactly the screen the mode was armed on. One glyph, one door.
const helpHudEl = document.getElementById('help-hud');
const helpTipEl = document.getElementById('help-tip');
const HELP_ENTRY_MODES = new Set(['playing', 'finale', 'dead', 'title', 'draft', 'escape']);
// The two controls with no controls_ref row (movement + the cog): one table,
// read by the explainer; the reference's TOUCH card carries the same names
// (joystick / SETTINGS (cog)) so the wording cannot fork.
const HELP_EXTRAS = {
  move: { keys: 'arrows / WASD', touch: 'joystick',
    purpose: 'move your hero (manual pilot) - weapons fire on their own' },
  settings: { keys: 'the cog (top-right)', touch: 'SETTINGS (cog)',
    purpose: 'settings: zoom, END RUN' },
};
// THE FIELD object meanings: ONE table for two consumers — the reference's
// THE FIELD card renders the `field` lines verbatim, the help-mode object
// pick renders `name` + `purpose`. No forked strings by construction.
const OBJECT_HELP = [
  { id: 'chest', name: 'CHEST', purpose: 'walk in: item, upgrades… or nothing + a mini-horde',
    field: 'chests — walk in: item, upgrades… or nothing + a mini-horde' },
  { id: 'portal', name: 'PORTAL', purpose: 'walk through to bank the wave',
    field: 'portal — walk through to bank the wave' },
  { id: 'arch', name: 'ARCH', purpose: 'cross the gate for a timed buff',
    field: 'arches — cross the gate for a timed buff' },
  { id: 'shrine', name: 'SHRINE', purpose: 'walk close, gold buys a blessing',
    field: 'shrines — walk close, gold buys a blessing' },
  // Ground potions have no THE FIELD row of their own (the TOUCH card's
  // potions row carries the restore wording); the explainer still names
  // what a dropped vial does when the player points at one.
  { id: 'potion', name: 'GROUND POTION', purpose: 'walk over to pick it up — restores health / mana' },
];
const helpObject = (id) => OBJECT_HELP.find(o => o.id === id) || null;
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
    'O pilot (AUTO ALL) &middot; TAB focus &middot; G stance',
    'Q / E (W too) skills &middot; H / N potions',
    'I stats &middot; ESC close / pause',
    '+ / - zoom &middot; R radar &middot; M map &middot; 1-3 draft, 1-6 tabs &middot; ? help mode',
  ],
  AUTO_MOVE: [
    'O pilot (AUTO MOVE) &middot; TAB focus &middot; G stance',
    'Q / E (W too) skills &middot; H / N potions',
    'I stats &middot; ESC close / pause',
    '+ / - zoom &middot; R radar &middot; M map &middot; 1-3 draft, 1-6 tabs &middot; ? help mode',
  ],
  MANUAL: [
    'O pilot (MANUAL) &middot; WASD / arrows move',
    'TAB focus &middot; G stance &middot; Q frost &middot; E overcharge',
    'I stats (S = move down) &middot; ESC close / pause',
    '+ / - zoom &middot; R radar &middot; M map &middot; 1-3 draft, 1-6 tabs &middot; ? help mode',
  ],
};
// The pre-(h) persisted mode name 'AUTO' is an alias, not a lookalike table:
// one array, so the copy cannot diverge between the two names.
HINT_LINES.AUTO = HINT_LINES.AUTO_ALL;

// The compact key list the retired '?' panel showed, kept as DATA: the
// reference's KEYBOARD CONTROLS section renders these lines (nobody loses
// the list; it stops being the whole of "?"). The touch-side wording is the
// controls_ref rows themselves (introLine(id, true)) — read live off the
// device-derived touch path, never a second table.
function compactKeyLines() {
  const lines = [...(HINT_LINES[normalizePilotMode(state.pilotMode)] || HINT_LINES.AUTO_ALL || [])];
  // G11: name the live challenge mode while a non-standard run is up.
  if (!isStandard(state.challenge)) {
    lines.splice(1, 0, 'CHALLENGE: ' + challengeOf(state.challenge).name);
  }
  return lines;
}

// ---- HELP MODE machinery -------------------------------------------------------
function enterHelpMode() {
  if (state.helpMode || !HELP_ENTRY_MODES.has(state.mode)) return false;
  state.helpMode = true;
  state.helpOrigin = state.mode;
  showHelpTip(null);
  syncHelpHud();
  return true;
}
function leaveHelpMode() {
  if (!state.helpMode) return;
  state.helpMode = false;
  state.helpOrigin = null;
  showHelpTip(null);
  syncHelpHud();
}
// The single-entry explainer. null = explain nothing (and say nothing on
// empty ground — no invented messages). `anchor` is WHAT the tip explains
// (a DOM element, or a plain client-space rect for a world-object tap) —
// the card is PLACED around it and must never sit on it.
function showHelpTip(html, anchor) {
  if (!helpTipEl) return;
  helpTipEl.innerHTML = html || '';
  if (helpTipEl.style) helpTipEl.style.display = html ? 'block' : 'none';
  if (!html) {
    // Hide = hand placement back to the stylesheet default (centred above
    // the leave strip); every inline placement write is undone.
    if (helpTipEl.style) {
      for (const k of ['left', 'top', 'bottom', 'transform', 'maxWidth']) {
        helpTipEl.style[k] = '';
      }
    }
    // If the banner had to yield its space to a tip, it comes back the
    // moment no tip is up (still placed by the same free-space rule).
    helpHudYielded = false;
    if (state.helpMode && helpHudEl && helpHudEl.style &&
        helpHudEl.style.display === 'none') syncHelpHud();
    return;
  }
  let rect = null;
  if (anchor && typeof anchor.getBoundingClientRect === 'function') {
    try { const r = anchor.getBoundingClientRect(); if (r && r.width >= 0) rect = r; } catch { /* stub */ }
  } else if (anchor && Number.isFinite(anchor.left) && Number.isFinite(anchor.top)) {
    rect = anchor;
  }
  if (!placeHelpSurface(helpTipEl, rect) && state.helpMode &&
      helpHudEl && helpHudEl.style && helpHudEl.style.display === 'block') {
    // The viewport cannot fit BOTH surfaces (568x320 with the pads, the
    // joystick and the banner all up leaves no free band at any width). The
    // tip the player just asked for wins: the banner's "tap a control to
    // learn it" instruction is spent the moment one is shown. Hiding is not
    // covering — every help surface still DISPLAYED clears the controls.
    helpHudYielded = true;
    helpHudEl.style.display = 'none';
    placeHelpSurface(helpTipEl, rect);
  }
}

// EVERY HELP-MODE SURFACE MUST CLEAR THE CONTROLS (owner 2026-09-17: the
// pre-tap BANNER still sat on the buttons; the rule is general now, not
// explainer-specific). The banner (#help-hud), the explainer (#help-tip) and
// any future help-mode prompt is placed in FREE SPACE by a ladder whose every
// rung is geometry READ FROM THE DOM at open time (getBoundingClientRect on
// the live chrome) — no layout constant is restated here, so the rule
// survives the UI moving exactly the way the width clamp survives a new
// phone. Ladder, in the brief's priority order:
//   1. free space BESIDE the tapped control (over the play area is correct,
//      sitting on the pads is not): above / below / left / right — for an
//      un-anchored surface (the banner) this is free space above the cluster,
//      below the top chrome;
//   2. (a) the OPPOSITE side of the cluster (anchor mirrored through the
//      viewport centre);
//   3. (b) SHRINK toward a readable minimum (the ladder re-runs 1+2 at each
//      smaller width cap — the cap only ever narrows the stylesheet's own
//      --fit-w clamp, never widens past it);
//   4. (c) DOCK to the top or bottom edge of the play area.
// A candidate is valid only if it clears EVERY visible control rect (the
// touch cluster, the cog row, the OTHER help surfaces) by HELP_CLEAR px AND
// stays inside the viewport. The explained control itself is NEVER covered,
// at any size: the last resort docks on the side opposite the anchor.
const HELP_CLEAR = 8;      // px of clearance required from every control rect
const HELP_MIN_W = 190;    // the shrink ladder's readable minimum
// True while the banner has YIELDED its space to a tip the viewport could not
// otherwise fit (the per-tick chrome sync must not resurrect it mid-tip).
let helpHudYielded = false;

function helpControlRects(excludeEl) {
  const out = [];
  const see = (el) => {
    if (!el || el === excludeEl || typeof el.getBoundingClientRect !== 'function') return;
    let r;
    try { r = el.getBoundingClientRect(); } catch { return; }
    if (r && r.width > 0 && r.height > 0) out.push(r);
  };
  if (typeof document.querySelectorAll === 'function') {
    document.querySelectorAll('#touch button, #joy').forEach(see);
  }
  // P2B99: the escape's pads are canvas-drawn, not DOM — feed their LIVE
  // rects (mapped through the canvas's own letterboxed rect) into the ladder
  // so a help surface can never sit on them. SKIP/MODE are always up in the
  // escape; the action pads only exist in MANUAL.
  if (state.mode === 'escape' && typeof document.getElementById === 'function') {
    const c = document.getElementById('game');
    if (c && typeof c.getBoundingClientRect === 'function') {
      const g = c.getBoundingClientRect();
      if (g.width > 0 && g.height > 0) {
        const rects = [SKIP_RECT, MODE_RECT];
        if (!ESCAPE.isAuto()) rects.push(LEFT_RECT, RIGHT_RECT, JUMP_RECT, DASH_RECT, KICK_RECT);
        for (const q of rects) {
          out.push({
            left: g.left + q.x / 480 * g.width, right: g.left + (q.x + q.w) / 480 * g.width,
            top: g.top + q.y / 300 * g.height, bottom: g.top + (q.y + q.h) / 300 * g.height,
            width: q.w / 480 * g.width, height: q.h / 300 * g.height,
          });
        }
      }
    }
  }
  // the OTHER help surface and the leave strip are visible chrome too
  see(helpTipEl);
  see(helpHudEl);
  see(document.getElementById('hud'));
  return out;
}

// Returns true when the surface sits in space that clears every visible
// control rect; false when it had to fall back (spared / opposite-half dock).
// Stub contexts count as placed (there is no layout to violate there).
function placeHelpSurface(el, anchor) {
  if (!el || !el.style || !el.innerHTML) return true;
  if (typeof document.querySelectorAll !== 'function' ||
      typeof el.getBoundingClientRect !== 'function' ||
      !globalThis.innerWidth || !globalThis.innerHeight) return true;
  const vw = globalThis.innerWidth, vh = globalThis.innerHeight;
  // The stylesheet's clamp stays the WIDTH authority: every inline cap in the
  // ladder is <= this value, so the card can only wrap earlier, never wider.
  let cssMax = Math.min(480, vw - 2 * HELP_CLEAR);
  try {
    const m = parseFloat(getComputedStyle(el).maxWidth);
    if (Number.isFinite(m) && m > 0) cssMax = Math.min(cssMax, m);
  } catch { /* stub context */ }
  const controls = helpControlRects(el);
  const A = anchor && Number.isFinite(anchor.left) && Number.isFinite(anchor.top)
    ? anchor
    : { left: vw / 2 - 1, top: vh / 2 - 1, right: vw / 2 + 1, bottom: vh / 2 + 1,
        width: 2, height: 2 };
  const clearsAll = (x, y, w, h) => {
    if (x < HELP_CLEAR - 0.5 || y < HELP_CLEAR - 0.5 ||
        x + w > vw - HELP_CLEAR + 0.5 || y + h > vh - HELP_CLEAR + 0.5) return false;
    for (const c of controls) {
      if (!(x + w + HELP_CLEAR <= c.left || c.right + HELP_CLEAR <= x ||
            y + h + HELP_CLEAR <= c.top || c.bottom + HELP_CLEAR <= y)) return false;
    }
    return true;
  };
  const clearsAnchor = (x, y, w, h) =>
    x + w + HELP_CLEAR <= A.left || A.right + HELP_CLEAR <= x ||
    y + h + HELP_CLEAR <= A.top || A.bottom + HELP_CLEAR <= y;
  const inVw = (x, y, w, h) =>
    x >= HELP_CLEAR - 0.5 && y >= HELP_CLEAR - 0.5 &&
    x + w <= vw - HELP_CLEAR + 0.5 && y + h <= vh - HELP_CLEAR + 0.5;
  const set = (x, y, rung) => {
    el.style.transform = 'none';
    el.style.bottom = 'auto';
    el.style.maxWidth = rung.mw + 'px';
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  };
  // Measure each width rung's real wrapped size ONCE (an abs-pos max-content
  // box sizes the same wherever it sits, so position is irrelevant here).
  el.style.transform = 'none';
  el.style.bottom = 'auto';
  const ladder = [];
  for (const mw of [cssMax, 300, 240, HELP_MIN_W]) {
    if (ladder.some((r) => r.mw <= mw)) continue;   // strictly narrower each rung
    el.style.maxWidth = mw + 'px';
    el.style.left = '0px';
    el.style.top = '0px';
    const r = el.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) ladder.push({ mw, w: r.width, h: r.height });
  }
  const cx = A.left + (A.width || 0) / 2, cy = A.top + (A.height || 0) / 2;
  let spared = null;   // best-effort: clears the ANCHOR + viewport, if nothing else
  // Candidates are ROUNDED TO PIXELS BEFORE validation (a card that validates
  // at 724.5 then rounds UP to 725 lands 0.5px inside the 8px clearance).
  const tryCand = (x, y, rung) => {
    const hiX = Math.floor(vw - HELP_CLEAR - rung.w), hiY = Math.floor(vh - HELP_CLEAR - rung.h);
    if (hiX < HELP_CLEAR || hiY < HELP_CLEAR) return false;   // rung too big
    x = Math.max(HELP_CLEAR, Math.min(hiX, Math.round(x)));
    y = Math.max(HELP_CLEAR, Math.min(hiY, Math.round(y)));
    if (clearsAll(x, y, rung.w, rung.h)) { set(x, y, rung); return true; }
    if (!spared && clearsAnchor(x, y, rung.w, rung.h) && inVw(x, y, rung.w, rung.h)) {
      spared = { x, y, rung };
    }
    return false;
  };
  // PASS 1 — beside the anchor, then (a) the opposite side of the cluster,
  // at every width rung ((b) the shrink ladder re-runs both).
  for (const rung of ladder) {
    const cands = [
      [cx - rung.w / 2, A.top - rung.h - HELP_CLEAR],       // above
      [cx - rung.w / 2, A.bottom + HELP_CLEAR],             // below
      [A.left - rung.w - HELP_CLEAR, cy - rung.h / 2],      // left
      [A.right + HELP_CLEAR, cy - rung.h / 2],              // right
      [vw - cx - rung.w / 2, vh - cy - rung.h / 2],         // (a) opposite side
    ];
    for (const [x, y] of cands) if (tryCand(x, y, rung)) return true;
  }
  // PASS 2 — (c) free space over the PLAY AREA, as a 2D scan whose candidate
  // positions come from the CONTROL RECT EDGES themselves (read from the same
  // DOM rects): a tight fit can only occur flush against a control edge (+
  // clearance) or a viewport edge or the centre. A 1D band scan is not
  // enough — at 568x320 the pads stack 4 rows and project onto EVERY y, yet
  // the mid-column is free; only the 2D rects know that. Top edge first
  // (above the cluster, below the top chrome — the brief's preferred spot),
  // then downwards; the outermost edges ARE the top/bottom docks.
  for (const rung of ladder) {
    const xs = new Set([HELP_CLEAR, (vw - rung.w) / 2, vw - HELP_CLEAR - rung.w]);
    const ys = new Set([HELP_CLEAR, (vh - rung.h) / 2, vh - HELP_CLEAR - rung.h]);
    for (const c of controls) {
      xs.add(c.right + HELP_CLEAR);
      xs.add(c.left - HELP_CLEAR - rung.w);
      ys.add(c.bottom + HELP_CLEAR);
      ys.add(c.top - HELP_CLEAR - rung.h);
    }
    for (const y of [...ys].sort((p, q) => p - q)) {
      for (const x of [...xs].sort((p, q) => p - q)) if (tryCand(x, y, rung)) return true;
    }
  }
  if (spared) { set(spared.x, spared.y, spared.rung); return false; }
  // Last resort: the narrowest rung, docked on the half OPPOSITE the anchor —
  // geometrically clear of the explained control whatever else it clips.
  const rung = ladder[ladder.length - 1];
  if (rung) {
    const x = cx < vw / 2 ? vw - HELP_CLEAR - rung.w : HELP_CLEAR;
    const y = cy < vh / 2 ? vh - HELP_CLEAR - rung.h : HELP_CLEAR;
    set(Math.max(HELP_CLEAR, Math.min(vw - HELP_CLEAR - rung.w, x)),
        Math.max(HELP_CLEAR, Math.min(vh - HELP_CLEAR - rung.h, y)), rung);
  }
  return false;
}
function helpLine({ keys, touch, purpose }) {
  const how = isTouchPath() ? touch : keys;
  return String(how).toUpperCase() + ': ' + purpose;
}
// data-act -> explainer text. Controls with a controls_ref row go through
// introLine (the SAME rows the reference pages read — no forked strings).
function helpActText(act) {
  const ACT_ROW = {
    focus: 'focus', stance: 'stance', pilot: 'pilot', q: 'skill-q', w: 'skill-w',
    h: 'potion-hp', n: 'potion-mp', radar: 'radar', map: 'map', stats: 'stats',
  };
  if (ACT_ROW[act]) return introLine(ACT_ROW[act], isTouchPath());
  if (act === 'settings') return helpLine(HELP_EXTRAS.settings);
  if (act === 'help') return introLine('help', isTouchPath());
  return null;
}
function syncHelpHud() {
  if (!helpHudEl || !helpHudEl.style) return;
  // While the banner has yielded to a tip, it stays down (the per-tick chrome
  // sync calls this too — it must not resurrect it mid-tip).
  const want = state.helpMode && !helpHudYielded ? 'block' : 'none';
  if (helpHudEl.style.display === want) return;
  helpHudEl.style.display = want;
  if (state.helpMode) {
    helpHudEl.textContent = isTouchPath()
      ? 'HELP MODE - TAP A CONTROL OR OBJECT TO LEARN IT · TAP HELP TO LEAVE'
      : 'HELP MODE - CLICK A CONTROL OR OBJECT TO LEARN IT · ? OR ESC TO LEAVE';
    // The banner is a HELP SURFACE: same free-space rule as the explainer,
    // placed over the play area, never on the controls it wants to help with.
    placeHelpSurface(helpHudEl, null);
  }
}
// Pointer client coords -> world coords, the exact inverse of the render
// camera (worldRegion below is the forward projection; this is its inverse,
// so the pick cannot drift from the draw).
function screenToWorld(cx, cy) {
  try {
    const r = canvas.getBoundingClientRect();
    if (!r || !r.width) return null;
    const Z = zoomScale(state.zoom);
    const vx = (cx - r.left) * (C.VIEW_W / r.width);
    const vy = (cy - r.top) * (C.VIEW_H / r.height);
    return {
      x: state.cam.x + C.VIEW_W / 2 + (vx - C.VIEW_W / 2) / Z,
      y: state.cam.y + C.VIEW_H / 2 + (vy - C.VIEW_H / 2) / Z,
    };
  } catch { return null; }
}
// World-space hit test for the canvas-drawn objects (chest / portal / arch /
// shrine / ground potions). Nearest within a finger-sized radius wins; empty
// ground explains nothing.
function pickHelpObject(cx, cy) {
  const w = screenToWorld(cx, cy);
  if (!w) return null;
  const R = 30;
  let best = null, bestD = R * R;
  const consider = (x, y, id) => {
    const d = (x - w.x) * (x - w.x) + (y - w.y) * (y - w.y);
    if (d <= bestD) { bestD = d; best = helpObject(id); }
  };
  if (state.portal) consider(state.portal.x, state.portal.y, 'portal');
  for (const c of state.chests || []) consider(c.x, c.y, 'chest');
  for (const s of state.shrines || []) if (!s.used) consider(s.x, s.y, 'shrine');
  for (const a of state.arches || []) consider(a.x, a.y, 'arch');
  for (const d of state.drops || []) consider(d.x, d.y, 'potion');
  return best;
}
// The touch-layer probe while the mode is armed: explain what was touched,
// never activate it. The "?" button itself is the one act that LEAVES. Every
// tip is ANCHORED to what it explains (the control's rect, or the tap point
// for a world object) so the placement ladder can keep the card off it.
function helpProbe(ev) {
  const t = ev.target;
  const joy = t && t.closest ? t.closest('[data-joy]') : null;
  if (joy) { showHelpTip(helpLine(HELP_EXTRAS.move), joy); return; }
  const btn = t && t.closest ? t.closest('[data-act]') : null;
  if (btn) {
    if (btn.dataset.act === 'help') { leaveHelpMode(); return; }
    showHelpTip(helpActText(btn.dataset.act), btn);
    return;
  }
  const px = ev.clientX ?? 0, py = ev.clientY ?? 0;
  const hit = pickHelpObject(px, py);
  showHelpTip(hit ? (hit.name + ' — ' + hit.purpose) : null,
    { left: px - 1, top: py - 1, right: px + 1, bottom: py + 1, width: 2, height: 2 });
}

// ---- FULLSCREEN — the transient canvas toggle (owner 2026-09-17) ----------
// The Fullscreen API needs a REAL user gesture, so the toggle fires on the
// button's own pointerdown (main canvas handler, hit-test FIRST — before any
// skip/interaction logic, so the show-on-interaction bump can never swallow
// the gesture that enters fullscreen). The button itself is PAINTED by the
// renderer in the play-HUD pass; this block owns the STATE: support probe
// (once, at module eval), the 0.5s visibility window, and the toggle.
// Support: iPhone iOS Safari ships no element Fullscreen API at all —
// requestFullscreen/webkitRequestFullscreen are both absent — so the probe
// reads false there and the button never paints (no dead control).
// fullscreenEnabled === false is the browser's explicit policy 'no' (e.g. a
// non-allowing iframe); undefined (old stubs / not consulted) is not a veto.
// Placement note: these consts sit BEFORE the init-time syncChrome() call
// below on purpose — syncChrome publishes state.fsOverlay and would trip the
// TDZ otherwise.
const FS_ROOT = (typeof document !== 'undefined' && document.documentElement) || null;
const FS_ENTER = FS_ROOT && (FS_ROOT.requestFullscreen || FS_ROOT.webkitRequestFullscreen);
const FS_EXIT = (typeof document !== 'undefined' &&
  (document.exitFullscreen || document.webkitExitFullscreen)) || null;
const FS_ELEMENT = () => (typeof document !== 'undefined' &&
  (document.fullscreenElement || document.webkitFullscreenElement)) || null;
const FS_NATIVE_SUPPORTED = !!(FS_ENTER && FS_EXIT &&
  (typeof document === 'undefined' || document.fullscreenEnabled !== false ||
    document.webkitFullscreenEnabled !== false));
// ADDENDUM (owner 2026-09-17): ONE fullscreen abstraction, two
// implementations — where the Fullscreen API exists the toggle uses it
// (desktop / Android / iPad); where it does NOT but this is a touch device
// (iPhone Safari — the API is iPad-only on iOS), the SAME button enters
// IMMERSIVE MODE: the wrap grows to 100dvh with safe-area insets, the
// non-gameplay chrome stands down, and the pads get bigger targets. Only a
// no-API NON-touch client gets no button at all. Evaluated LIVE (not at
// module eval) because the touch path is itself derived at boot.
function fsMode() {
  if (FS_NATIVE_SUPPORTED) return 'native';
  if (isTouchPath()) return 'immersive';
  return 'none';
}
const fsOverlay = { t: 0 };        // seconds of button visibility remaining
let immersiveOn = false;
let immersiveHintShown = false;    // the Add-to-Home-Screen toast is once/session
let fsReapplies = 0;               // address-bar collapse nudges (seam counter)
function fsBump() {
  fsOverlay.t = C.FULLSCREEN.HIDE_S;
  // Safari brings the address bar back on interaction — re-attempt the
  // collapse nudge every time while immersive (no-op elsewhere).
  if (immersiveOn) fsReapplyBarCollapse();
}
// Safari only collapses its address bar for a SCROLLED page, and the page
// here is overflow:hidden — the nudge is attempted anyway (guarded; harmless
// where the page cannot scroll) and its COUNT is reported, because the
// collapse itself cannot be verified outside a real device.
function fsReapplyBarCollapse() {
  fsReapplies++;
  try { window.scrollTo(0, 1); } catch { /* no scroll (headless / desktop) */ }
}
function applyImmersive(on) {
  immersiveOn = on;
  const body = typeof document !== 'undefined' && document.body;
  if (body && body.classList) body.classList.toggle('immersive', on);
  // The re-fit is the whole point: the CSS grows the wrap to 100dvh and
  // enlarges the pads; fitCanvas recomputes the letterbox against the new
  // viewport — the SAME path the resize/orientationchange listener takes,
  // so immersive, dynamic viewport changes and rotation share one code path.
  fitCanvas();
  if (on) {
    fsReapplyBarCollapse();
    // The honest iPhone answer, said once: true fullscreen is Add to Home
    // Screen (standalone). The manifest + apple metas make that work.
    if (!immersiveHintShown) {
      immersiveHintShown = true;
      toast('No true fullscreen in Safari — Add to Home Screen for it');
    }
  }
}
// Visible only where SOME mode can work, the window is live, and the pad
// screens are up (chromeOn: playing/finale) — menus, draft cards, the
// end-of-run summary and the cinematics keep their surfaces clear of the
// button (the task's non-overlap rule), and it cannot eat an intro-skip tap.
function fsVisible() {
  // The 1e-9 epsilon makes the hide land at EXACTLY C.FULLSCREEN.HIDE_S of
  // frames (30 at 60Hz) — the decay arithmetic leaves ~1e-17 residue
  // otherwise and the button would linger one frame past its named window.
  // PROLOGUE ADDENDUM (owner 2026-09-18): the fullscreen button stands DOWN
  // through the whole first-run phase ("all buttons should be disabled") —
  // HIDDEN rather than greyed because a canvas glyph cannot carry a disabled
  // affordance legibly at 22x18 view px (disclosed in the report). fsVisible
  // gates fsHit, so the enlarged target is inert too — it can never eat the
  // banner-OK tap.
  return fsMode() !== 'none' && fsOverlay.t > 1e-9 && chromeOn() &&
    !(state.prologue && !state.prologue.skipped);
}
// The button box in VIEW coordinates — the ONE geometry source the renderer
// paints, the hit-test reads and the tests assert (canvasRegion projects it
// to CSS for the phone-size overlap checks).
function fsButtonRect() {
  return {
    x: C.VIEW_W - C.FULLSCREEN.INSET - C.FULLSCREEN.W,
    y: (C.VIEW_H - C.FULLSCREEN.H) / 2,
    w: C.FULLSCREEN.W, h: C.FULLSCREEN.H,
  };
}
// THE HIT BOX (owner 2026-09-17, msg_01M2S9GX95: "make the hit area or
// clickable area larger... keep the visual size of the icon the same"):
// centred on the painted icon, clamped inside the view, never smaller than
// the icon. 64x56 view px is ~52x45 CSS px at the common phone letterbox —
// above the 44px touch floor while the ICON stays 22x18. fsVisible gates
// fsHit below, so the enlarged target is COMPLETELY INERT while hidden (it
// can never eat a gameplay tap) and while the pad screens are down.
function fsHitRect() {
  const icon = fsButtonRect();
  const w = Math.max(C.FULLSCREEN.HIT_W, icon.w), h = Math.max(C.FULLSCREEN.HIT_H, icon.h);
  // EDGE_GUARD on the right: the view's right edge abuts the right pad's
  // touch territory (~6 CSS px seam at landscape letterboxes; Chromium snaps
  // touch targets from ~10 px out) — the hit box stays inside the canvas,
  // clear of the pad. 8 view px guard keeps the icon's right edge (INSET 8)
  // exactly on the hit box's right edge: still fully covered.
  const x = Math.max(0, Math.min(icon.x + icon.w / 2 - w / 2, C.VIEW_W - C.FULLSCREEN.EDGE_GUARD - w));
  const y = Math.max(0, Math.min(icon.y + icon.h / 2 - h / 2, C.VIEW_H - h));
  return { x, y, w, h };
}
// A pointer event -> view coords -> inside the on-screen button's HIT box.
// Reads the canvas's REAL rect, so it lands correctly at any letterbox scale.
function fsHit(ev) {
  if (!fsVisible()) return false;
  const r = canvas.getBoundingClientRect();
  if (!r || !r.width || !r.height) return false;
  const b = fsHitRect();
  const vx = ((ev.clientX ?? 0) - r.left) / r.width * C.VIEW_W;
  const vy = ((ev.clientY ?? 0) - r.top) / r.height * C.VIEW_H;
  return vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h;
}
function toggleFullscreen() {
  const mode = fsMode();
  if (mode === 'none') return false;
  if (mode === 'native') {
    if (FS_ELEMENT()) FS_EXIT.call(document);
    else FS_ENTER.call(FS_ROOT);
    return true;
  }
  applyImmersive(!immersiveOn);   // iPhone Safari: the immersive fallback
  return true;
}

// G31: apply the persisted pilot + stance prefs ONCE at boot, so a reload
// keeps the player's choice (title + settings reflect it). swapPilotMode's
// same-mode early return makes the default (AUTO_ALL / BALANCED) a silent
// no-op — no boot toast, no controller churn. NOTE: this runs LATE in module
// init on purpose — swapPilotMode fans out into clearPilotInput (joyKnobEl),
// whose consts initialise above but after the swapPilotMode definition
// itself.
swapPilotMode(loadPilotPref());
applyStancePref();
// WAVE-25 (audit 2.1) init-time sync: the chrome gate must hold from the
// FIRST frame of every mode — including before any frame at all (the intro
// check reads the layer state straight after module load). The retired
// applyHints() boot call used to be what ran this; the sync is the part
// that survives the panel's retirement.
syncChrome();

// A2 THE RADAR: one toggle, one code path — the R key and the RADAR touch
// button both land here (the button through runAction, the key directly).
// The state flag is the whole mechanism: render.js reads it every frame, so
// ON paints from the next frame and OFF leaves nothing behind (the canvas is
// repainted whole every frame; there is no radar DOM to leak). The toast is
// the discovery feedback, same pattern as the stance cycle.
function toggleRadar() {
  state.radarOn = !state.radarOn;
  controlUsed('radar');   // PER-CONTROL INTRODUCTIONS: used = learned
  toast('RADAR ' + (state.radarOn ? 'ON' : 'OFF') + ' (R)', '#b8e0ff');
  return state.radarOn;
}

// M1: the map screen toggle. CLOSED by default at boot and on every startRun
// (C6); the sim KEEPS RUNNING while it is open (C1 — no free dodge button).
function toggleMap() {
  state.mapOpen = !state.mapOpen;
  controlUsed('map');   // PER-CONTROL INTRODUCTIONS: used = learned
  toast('MAP ' + (state.mapOpen ? 'OPEN' : 'CLOSED') + ' (M)', '#b8e0ff');
  return state.mapOpen;
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
// FLOATING JOYSTICK api (null when the touch layer is absent — every caller
// degrades to a no-op). Assigned at the bottom of the block below.
let fjoyApi = null;

if (touchLayer && touchLayer.addEventListener) {
  let joyPointerId = null;   // the finger that owns the stick (null = free)

  // Offset (px from base center, client space) -> analog input + knob visual.
  // rad = base radius in px. Exposed via __TEST as joyVec for the smoke probes.
  // knobEl (2026-09-18): which knob visual moves — the fixed base's #joy-knob
  // or the floating stick's #fjoy-knob; same math, same clamping.
  function applyJoyVector(dx, dy, rad, knobEl) {
    if (knobEl === undefined) knobEl = joyKnobEl;
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
    if (knobEl && knobEl.style) {
      knobEl.style.transform =
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

  // ---- FLOATING (DYNAMIC) JOYSTICK (owner 2026-09-18, msg_01M2S5BMY6) ----
  // Touch anywhere on the CANVAS in MANUAL play steers: the press arms the
  // stick AT the touch point (the canvas handler runs fsHit FIRST, so the
  // fullscreen button's own tap still toggles; the pads/cog row are DOM above
  // the canvas and never reach this path). The visual — origin ring + knob —
  // is #fjoy, pointer-inert: the canvas owns the gesture, so the ring can
  // never intercept its own drag. The drag feeds the SAME applyJoyVector /
  // pilotInput the fixed base uses (dead zone JOY_DEAD_ZONE, magnitude =
  // deflection fraction); release is a DEAD STOP (joyRecenter), identical to
  // a keyboard keyup. Guards: touch paths only, one stick at a time (pointer
  // id), playing mode only, help-mode declines, MANUAL only.
  const fjoyEl = document.getElementById('fjoy');
  const fjoyKnobEl = document.getElementById('fjoy-knob');
  const fjoy = { pointerId: null, ox: 0, oy: 0, rad: C.JOY.FLOAT_R };
  let fjoyCaptures = 0;
  function fjoyShow() {
    if (!fjoyEl || !fjoyEl.style) return;
    fjoyEl.style.left = (fjoy.ox - fjoy.rad) + 'px';
    fjoyEl.style.top = (fjoy.oy - fjoy.rad) + 'px';
    fjoyEl.style.display = 'block';
    if (fjoyKnobEl && fjoyKnobEl.style) fjoyKnobEl.style.transform = 'translate(0px,0px)';
  }
  function fjoyRelease(ev) {
    if (fjoy.pointerId === null) return;
    if (ev && ev.pointerId !== undefined && ev.pointerId !== fjoy.pointerId) return;
    fjoy.pointerId = null;
    joyRecenter();   // dead stop — same as keyup, no coast
    if (fjoyKnobEl && fjoyKnobEl.style) fjoyKnobEl.style.transform = 'translate(0px,0px)';
    if (fjoyEl && fjoyEl.style) fjoyEl.style.display = 'none';
  }
  function fjoyTryArm(ev) {
    if (!C.JOY.FLOAT || !isTouchPath()) return false;
    if (fjoy.pointerId !== null) return false;                  // one stick
    if (state.mode !== 'playing') return false;                  // runs only
    if (state.helpMode) return false;                            // "?" owns taps
    if (normalizePilotMode(state.pilotMode) !== 'MANUAL' &&
        // PROLOGUE STAGED INTRODUCTION: once MOVE is revealed the drag IS
        // the lesson — the floating stick arms in ANY pilot mode through
        // the phase (the banner's OK/SKIP rects were hit-tested BEFORE
        // this, so a banner tap still never steers).
        !(state.prologue && state.prologue.revealed &&
          state.prologue.revealed.move)) return false;
    fjoy.pointerId = ev.pointerId ?? 0;
    fjoy.ox = ev.clientX ?? 0; fjoy.oy = ev.clientY ?? 0;
    // POINTER CAPTURE: keep THIS finger's moves/lifts arriving even if the
    // drag leaves the canvas — belt to the window listeners' braces (capture
    // semantics are unverifiable headless; the global id-filtered listeners
    // are the testable path, audit-round-2 precedent).
    if (typeof canvas.setPointerCapture === 'function') {
      try { canvas.setPointerCapture(fjoy.pointerId); fjoyCaptures++; }
      catch { /* captured or not, the window listeners own the lift */ }
    }
    fjoyShow();
    return true;
  }
  function fjoyPointerMove(ev) {
    if (fjoy.pointerId === null || ev.pointerId !== fjoy.pointerId) return;
    if (ev.preventDefault) ev.preventDefault();
    applyJoyVector((ev.clientX ?? 0) - fjoy.ox, (ev.clientY ?? 0) - fjoy.oy,
      fjoy.rad, fjoyKnobEl);
  }
  // CONTROL BANDS (owner 2026-09-18, msg_01M2S6XRT0): the stick's HOME band
  // — #steer-zone, placed by fitCanvas (the LEFT band in landscape, the
  // bottom-centre strip between the pads in portrait). SAME arm path as the
  // canvas (fjoyTryArm and all its guards); the pads sit ABOVE it in DOM
  // order so their presses stay theirs; the bubbled event still reaches the
  // touchLayer funnel (audio unlock, fs bump, help probe) and help-mode
  // declines INSIDE the hook.
  const steerZoneEl = document.getElementById('steer-zone');
  if (steerZoneEl && steerZoneEl.addEventListener) {
    steerZoneEl.addEventListener('pointerdown', (ev) => {
      if (fjoyTryArm(ev) && ev.preventDefault) ev.preventDefault();
    });
  }

  touchLayer.addEventListener('pointerdown', (ev) => {
    audioUnlockGesture();   // S2: a touch IS a user gesture — unlock audio
    fsBump();               // FULLSCREEN: a pad/joystick press is an interaction
    // HELP MODE: the funnel intercepts FIRST — a tap explains what it
    // touches (control, joystick or world object), never activates it.
    if (state.helpMode) {
      if (ev.preventDefault) ev.preventDefault();
      helpProbe(ev);
      return;
    }
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
    fjoyRelease(ev);   // floating stick: same lift, same brake (id-filtered)
  };
  // AUDIT ROUND 2 (2026-09-16): the release listeners moved from touchLayer to
  // WINDOW. pointerup fired on the touch layer only reaches the layer when the
  // finger lifts back OVER it — steer off the layer (or off the canvas) and the
  // lift never arrived: joyPointerId stayed captured and the last drag vector
  // steered the pilot forever. The lift can land anywhere, so the listener must
  // be global. WINDOW LISTENERS over setPointerCapture: capture would also
  // retarget the lift to the layer, but it depends on browser capture semantics
  // the headless DOM cannot exercise, and it breaks silently when the layer is
  // hidden/re-rendered mid-drag (lostpointercapture edge cases); a global
  // listener is the plain, testable fix. Multi-touch stays safe (isJoyPointer
  // filters by pointer id) and blur -> clearPilotInput still covers alt-tab.
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    // FLOATING JOYSTICK: the drag's moves arrive wherever the pointer lands
    // (the press started on the canvas; capture retargets to it in a real
    // browser, and this global listener is the headless-testable twin).
    window.addEventListener('pointermove', fjoyPointerMove);
  } else {   // no window (never in the shipped build; keeps the seam total)
    touchLayer.addEventListener('pointerup', releasePointer);
    touchLayer.addEventListener('pointercancel', releasePointer);
  }
  joyVec = applyJoyVector;
  joyRelease = joyRecenter;
  fjoyApi = {
    tryArm: fjoyTryArm,
    release: fjoyRelease,
    armed: () => fjoy.pointerId !== null,
    origin: () => ({ x: fjoy.ox, y: fjoy.oy, rad: fjoy.rad }),
    captures: () => fjoyCaptures,
    el: fjoyEl,
    knob: fjoyKnobEl,
  };
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
  // V1 REGISTRATION: 'escape' is likewise chrome-OFF BY NAME — the side
  // scroller's d-pad/cog/? are meaningless (and inert: its input never routes
  // through the touch layer), so the whole layer stands down for the whole
  // mode (verified in test_v1_escape + the phone verifier).
  // G15 REGISTRATION: 'death-cine' is chrome-OFF BY NAME too — a cinematic,
  // not a run screen (verified in test_death_cine + the phone verifier).
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
  state.runPurse = purseClamp(profile.runPurse);
  state.zoomScale = zoomScale(state.zoom);
  // FULLSCREEN toggle state for the renderer, published once per frame: the
  // button paints only where the API exists, the 0.5s window is live and the
  // pad screens are up (fsVisible = the chromeOn gate — same screens as the
  // pads, so menus/drafts/summary never carry it).
  state.fsOverlay = {
    mode: fsMode(),
    supported: fsMode() !== 'none',
    visible: fsVisible(),
    active: fsMode() === 'native' ? !!FS_ELEMENT() : immersiveOn,
  };
  const on = chromeOn();
  // LADDER: while the top strip is transient, the cog row + text HUD ride the
  // SAME reveal window as the fullscreen button — fsOverlay is bumped by every
  // interaction (key, pad press, canvas tap), so there is ONE show/fade
  // system, not a second one. While the window is closed the strip is opacity
  // 0 + pointer-events none (index.html): visually gone AND completely inert.
  setBodyClass('chrome-reveal', topTransient && on && fsOverlay.t > 1e-9);
  let chromeLayoutChanged = false;
  if (touchLayer && touchLayer.style) {
    const want = on ? '' : 'none';
    if (touchLayer.style.display !== want) { touchLayer.style.display = want; chromeLayoutChanged = true; }
  }
  // WAVE-15: the joystick shows ONLY while the manual pilot is bound mid-run.
  // FLOATING JOYSTICK (2026-09-18): on touch paths the floating stick IS the
  // movement idiom, so the fixed base stands down (C.JOY.FLOAT is the
  // one-line flip back); desktop/cog-only keeps the fixed base for mouse-drag
  // (WAVE-23 parity). The [data-joy] handler above stays live either way.
  if (joyEl && joyEl.style) {
    const wantJoy = (on && state.pilotMode === 'MANUAL' &&
      !(C.JOY.FLOAT && isTouchPath())) ? 'block' : 'none';
    if (joyEl.style.display !== wantJoy) { joyEl.style.display = wantJoy; chromeLayoutChanged = true; }
  }
  // MOBILE EMBED LAYOUT: the free band the canvas is bounded to changes the
  // moment the pad layer or the joystick appears/disappears — re-fit when one
  // of those writes actually flipped (all are change-guarded, so this fires
  // on transitions, never per frame). (The retired hints panel's top-strip
  // reservation went with the panel; the help strip is pointer-inert overlay
  // chrome that does not reflow the canvas.)
  // HELP MODE: if the mode somehow outlives a screen it cannot serve (a mode
  // change mid-inspect), it stands down here — the strip can never strand.
  if (state.helpMode && !HELP_ENTRY_MODES.has(state.mode)) leaveHelpMode();
  syncHelpHud();
  if (chromeLayoutChanged) fitCanvas();
}
// LADDER STEP 2 text (owner 2026-09-17: "2nd would be reduced text in the
// control buttons. A1/A2/M, that kind of thing"): in compact mode the pilot
// rungs abbreviate to the owner's own short forms. Pure — exposed via __TEST
// (pilotBadgeText) so the node suite pins the mapping. The full wording stays
// reachable off the button: the SETTINGS PILOT card (pilotPrefLabel) and the
// help-mode explainer carry it.
function pilotBadgeText(mode, act, compact) {
  const ABBR = { AUTO_ALL: 'A1', AUTO_MOVE: 'A2', MANUAL: 'M' };
  const m = compact ? (ABBR[mode] || mode) : mode;
  return act && act !== mode ? m + ' \u00b7 ' + act : m;
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
  set('tc-pilot', pilotBadgeText(state.pilotMode, act, padsCompact));
  const skill = (id, defId) => {
    // N1 slice 3 + 2026-09-17 mana price: an ult badge reads charge AND the
    // pool — cooling (`12.0s`) while the floor runs, LOW when charged but
    // unaffordable (the same word the Q/W readouts use), RDY at full charge
    // with the pool up, else `34/40`.
    const u = ultCharge(state, defId);
    if (u) {
      set(id, u.cooldown > 0 ? u.cooldown.toFixed(1) + 's'
        : (u.charge < u.need ? u.charge + '/' + u.need
          : (u.mana < u.manaCost ? 'LOW' : 'RDY')));
      return;
    }
    const cd = p.skillCd[defId];
    // G8 step 4: the readiness readout reads the SAME helpers useSkill pays
    // (perks.js), so FOCUS cannot make the button text lie about RDY/LOW.
    set(id, cd > 0 ? cd.toFixed(1) + 's' : (p.mana >= skillManaCost(defId, state) ? 'RDY' : 'LOW'));
  };
  skill('tc-q', classSkillId(state));
  skill('tc-w', 'OVERCHARGE');
  // RSS8: the MAGNET button exists only in runs that hold the card (hidden
  // otherwise — a control for an ability you do not have is noise), and its
  // badge reads the SAME helpers useSkill pays, like Q/W above.
  const magBtn = touchEls['tc-magnet'];
  if (magBtn) magBtn.hidden = !magnetHeld(state);
  if (magnetHeld(state)) skill('tc-mag', 'MAGNET_PULL');
  set('tc-h', String(p.potions.hp));
  set('tc-n', String(p.potions.mp));
  // A2: the RADAR button carries no badge — its lit frame IS the readout
  // (state-driven, rewritten every frame like the badges above).
  const radarBtn = touchEls['tc-radar'];
  if (radarBtn && radarBtn.classList) radarBtn.classList.toggle('on', !!state.radarOn);
  const mapBtn = touchEls['tc-map'];
  if (mapBtn && mapBtn.classList) mapBtn.classList.toggle('on', !!state.mapOpen);
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
    // N1 slice 3 + 2026-09-17 mana price: an ult reads charge / RDY / cooling
    // / LOW — a charged ult the pool cannot afford says LOW, matching the
    // touch badge and the Q/W readouts (one word, one meaning).
    const u = ultCharge(state, id);
    if (u) {
      if (u.cooldown > 0) return `${label} ${u.cooldown.toFixed(1)}s`;
      if (u.charge < u.need) return `${label} ${u.charge}/${u.need}`;
      return u.mana < u.manaCost ? `${label} LOW` : `${label} RDY`;
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
    `   ${describeHeat(heatOf(state))} · ${describeHeatPayout(manualPushes(state))}` +
    (archBits.length ? `   ARCH ${archBits.join(' ')}` : '') + '\n' +
    `RUN ${runClock(state.time)}/${runClock(C.RUN.LIMIT)}   WAVE ${state.wave.num} - ${waveTxt}   LVL ${p.level}   XP ${Math.floor(p.xp)}/${p.xpNext}\n` +
    // G11: the mode badge line — only while a NON-standard mode is live, so a
    // STANDARD run's text HUD is byte-identical to before.
    // G25 slice 1: THE MARK OF THE GRIND — pure proof, no power. The flourish
    // line rides the text HUD ONLY while the run's apex mark stamp is live
    // (owned + toggled ON); a normal run renders byte-identically to before.
    (state.apexMark ? 'APEX MARK OF THE GRIND\n' : '') +
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
  // UP-FRONT CONTROLS (owner 2026-09-16): the WAVE-19 first-boot auto-pop
  // moved to the FIRST-RUN GATE — a fresh boot lands on the title, and the
  // FIRST START GAME shows HOW TO PLAY once, GOT IT starts the run. The
  // explanation now sits at the moment it matters (right before the first
  // fight) instead of before the menu. Never mid-run by construction.
  showTitle();
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
// V1: during the escape a tap is PLAY — mapped into the mode's own virtual
// 480x300 (the skip rect first, then a tap anywhere jumps for MANUAL play).
if (canvas.addEventListener) canvas.addEventListener('pointerdown', (ev) => {
  audioUnlockGesture();     // S2: a tap IS a user gesture — unlock audio
  // FULLSCREEN (owner 2026-09-17): the button's OWN tap toggles — hit-test
  // FIRST, before the skip/interaction logic below, so nothing can swallow
  // the gesture (the same press that shows the button is the user gesture
  // the Fullscreen API requires; the bump keeps it visible through the
  // toggle rather than hiding it mid-press).
  if (fsHit(ev)) {
    if (ev.preventDefault) ev.preventDefault();
    toggleFullscreen();
    fsBump();
    return;
  }
  fsBump();                 // any other canvas tap is still an interaction
  // FIRST-RUN PROLOGUE: the banner's OK button — hit-test BEFORE the
  // joystick arms, so the tap that dismisses a banner never steers. Only the
  // button itself consumes the gesture; every other press during the
  // prologue is an ordinary steering press (the banners are non-modal).
  if (state.prologue && prologueBanner()) {
    const r0 = canvas.getBoundingClientRect();
    if (r0.width && r0.height) {
      const vx0 = (ev.clientX - r0.left) / r0.width * C.VIEW_W;
      const vy0 = (ev.clientY - r0.top) / r0.height * C.VIEW_H;
      const okR = prologueOkRect();
      if (vx0 >= okR.x && vx0 <= okR.x + okR.w && vy0 >= okR.y && vy0 <= okR.y + okR.h) {
        if (ev.preventDefault) ev.preventDefault();
        prologueOk();
        return;
      }
      // SKIP ALL — the proposed second live control (see prologueSkipRect):
      // one press ends the phase and restores the full control set.
      const skR = prologueSkipRect();
      if (vx0 >= skR.x && vx0 <= skR.x + skR.w && vy0 >= skR.y && vy0 <= skR.y + skR.h) {
        if (ev.preventDefault) ev.preventDefault();
        prologueSkip();
        return;
      }
    }
  }
  // FLOATING JOYSTICK (owner 2026-09-18): a canvas press in MANUAL play arms
  // the stick AT the touch point. AFTER fsHit above (the fullscreen button's
  // own tap toggles, never steers); the hook itself declines help-mode,
  // non-playing modes and non-MANUAL pilots, so everything below (escape,
  // cinematic skips) is untouched.
  if (fjoyApi && fjoyApi.tryArm(ev)) {
    if (ev.preventDefault) ev.preventDefault();
    return;
  }
  if (state.mode === 'escape') {
    // HELP MODE (VK9P4: the escape joined the entry set): a tap EXPLAINS,
    // never activates — the touchLayer funnel's mirror on the canvas path, so
    // the JUMP/KICK pads cannot fire (and cannot be swallowed silently) with
    // the reference open.
    if (state.helpMode) {
      if (ev.preventDefault) ev.preventDefault();
      const hr = canvas.getBoundingClientRect();
      if (hr.width && hr.height) {
        const vx = (ev.clientX - hr.left) / hr.width * C.VIEW_W;
        const vy = (ev.clientY - hr.top) / hr.height * C.VIEW_H;
        showHelpTip(ESCAPE.explain(vx, vy),
          { left: ev.clientX - 1, top: ev.clientY - 1, right: ev.clientX + 1, bottom: ev.clientY + 1, width: 2, height: 2 });
      }
      return;
    }
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      ESCAPE.pointer((ev.clientX - r.left) / r.width * C.VIEW_W,
        (ev.clientY - r.top) / r.height * C.VIEW_H, ev.pointerId);
    }
    return;
  }
  // Armed ONLY when this gesture actually ended a cinematic — never during play.
  const skipping = state.mode === 'intro' ||
    (state.mode === 'portal-cine' && C.CINE.SKIPPABLE) ||
    (state.mode === 'death-cine' && C.CINE.SKIPPABLE);
  if (skipping) uiGuard.arm();
  endIntro();
  if (C.CINE.SKIPPABLE) { endPortalCine(); endDeathCine(); }
});
// P2B99: the lift of a touch. The escape's LEFT/RIGHT pads HOLD — a finger
// down keeps running, and the LIFT is the brake the appendage gauntlet is
// timed around. pointerup/pointercancel (either one ends a press) route to
// the escape WITH the pointerId: the lift releases only ITS OWN pad, so the
// right thumb tapping JUMP mid-run cannot drop the left thumb's RUN finger
// (the two-thumb phone pattern); a finger that slid off its pad still cannot
// leave a phantom run pinned.
if (canvas.addEventListener) {
  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (ev) => {
      if (state.mode === 'escape') ESCAPE.pointerUp(ev.pointerId);
    });
  }
}

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
  // NIGHT MODE: no one is watching the movie — hand straight to the end
  // handler (the same call isDone would make).
  if (state.nightRun) endPortalCine();
}
function endPortalCine() {
  if (state.mode !== 'portal-cine') return;
  // WAVE-10: the END_WAVE cast fell and the maw MILESTONE begins (final_boss.js).
  // RUN-STRUCTURE: the maw is the run's milestone beat at END_WAVE, not the
  // run's ending — it is a bounded encounter, and every wave AFTER it resumes
  // the ordinary ladder (intermission -> CONTINUE) up to the 30:00 limit.
  if (state.wave.num === C.ESCALATION.END_WAVE) { startFinale(); return; }
  // V1 THE ESCAPE SEQUENCE (owner trigger decision 2026-09-15): the escape
  // hangs off PORTAL ENTRY — beating the wave-1 boss and walking into the
  // portal starts the side-scroller INSTEAD of the wave-2 intermission. It
  // ends SOFT (complete/caught/fell/skip) back into openIntermission, so the
  // ordinary ladder resumes unchanged.
  if (state.wave.num === 1) { startEscape(); return; }
  openIntermission();
}

// ---------- G15: the death movie (src/death_cine.js) ------------------------
// The movie plays on DEATH ONLY: die() composes the payoff overlay, HIDES it,
// and hands the beat to this mode; the run survived (runSurvived) and the
// deliberate exit (endRun) never come through here and keep their instant
// overlay. endDeathCine() is the single hand-off back: it reveals the
// ALREADY-COMPOSED overlay (never recomposes it — gold was settled exactly
// once in die()) and lands in the terminal 'dead' mode. Same skip contract as
// the intro / portal cine: any key or tap, gated by C.CINE.SKIPPABLE, with
// uiGuard.arm() so the skipping gesture cannot also press RETRY.
let deathCineT0 = 0;
function startDeathCine() {
  deathCineT0 = performance.now();
  state.mode = 'death-cine';
  // NIGHT MODE: skip the movie — straight to the composed payoff card (the
  // auto-RETRY is armed beside the compose in die()).
  if (state.nightRun) endDeathCine();
}
function endDeathCine() {
  if (state.mode !== 'death-cine') return;
  state.mode = 'dead';
  // MODAL SUPPRESSION (the reveal half, owner 2026-09-17 msg_01M2RVD9): the
  // queue is purged HERE and only here — this is the moment the summary
  // becomes the visible surface, and a toast can land at any point up to it
  // (ttl is frozen outside update(), the known late-message source). The win
  // path never runs a cine and never purges, so the funnel's trophy /
  // unlock announcements survive for the suite (they cannot paint: 'dead' is
  // in HUD_SUPPRESSED_MODES).
  state.toasts.length = 0;
  state.bossBanner = null;
  overlay.style.display = 'flex';
  maybeDeathCoach();
}

// ---------- V1: THE ESCAPE SEQUENCE (src/escape/) ----------------------------
// The mode's whole engine lives in its own directory; main.js only starts it,
// routes input to it while it is live, and takes the (always-soft) hand-back.
function startEscape(opts = {}) {
  state.portal = null;
  state.mode = 'escape';
  ESCAPE.begin({
    // The corridor seed is the run's identity, not a sim input; anything
    // deterministic per run will do (never Math.random inside the sim).
    seed: (Date.now() & 0x7fffffff) || 1,
    profile,
    // AUTO pilots ride the template controller (bands, clamps, boss steering);
    // a MANUAL pilot plays the escape by hand — same seam as the overhead
    // movement-authority predicate. VK9P4: `getAuto` is read LIVE every frame
    // (the pilot pref is the ONE source of truth — a flip mid-run changes who
    // drives on the next frame, no restart, no lost progress), and
    // `onToggleMode` hands the escape's MODE button/key back into main's own
    // swapPilotMode (persisted pref + toast — no second pilot anywhere).
    auto: !pilotMovesYou(),
    getAuto: () => !pilotMovesYou(),
    onToggleMode: () => swapPilotMode(pilotMovesYou() ? 'AUTO_ALL' : 'MANUAL'),
    onEnd: opts.test ? endEscapeTest : endEscape,
    // The in-run settings TEST button: a play-test entry that PAYS NOTHING
    // (the payout is repeatable currency — a paying test button would be a
    // faucet) and returns to the paused settings screen, not the wave-2
    // intermission the real portal entry hands off to.
    test: !!opts.test,
  });
  // NIGHT MODE: the ONE sanctioned content skip (an unattended run cannot
  // play a side-scroller). Skipping without the paid writ forgoes the payout
  // — the escape's own rule, unchanged.
  if (state.nightRun && !opts.test) ESCAPE.skip();
}
// The test entry's hand-back: the run is still live underneath — reopen the
// paused settings screen the button came from (BACK resumes the run through
// the normal closeSettings path, so chrome re-registers by name).
function endEscapeTest() {
  state.mode = state.settingsReturn || 'playing';
  overlay.style.display = 'none';
  openSettings();
}
function endEscape(r) {
  // The ladder resumes exactly where the portal would have taken it: wave 1
  // cleared, CONTINUE into wave 2. The lead line carries the escape's story
  // (and its payout, when it paid one) onto the intermission screen.
  const lead = r.result === 'complete'
    ? `ESCAPE COMPLETE +${r.payout}g (bank) in ${Math.floor(r.seconds)}s`
    : r.result === 'skip'
      ? (r.paidSkipUsed ? `ESCAPE SKIPPED (writ) +${r.payout}g (bank)` : 'ESCAPE SKIPPED — payout forgone')
      : r.result === 'caught'
        ? 'ESCAPE FAILED: caught by the horde — the run continues'
        : 'ESCAPE FAILED: fell — the run continues';
  openIntermission({ lead });
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
  state.shrines = [];    // S1: the world-seeded set closes at the end
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
  // WAVE-14, RESTORED 2026-09-17 (owner correction): the maw's arrival is a
  // set-piece finale announcement — the prominent centre banner is back (the
  // peripheral rule no longer applies to the finale).
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
  // G33: the estimator ticks in the finale loop too, so a maw kill streak
  // counts toward the adaptive curve and the rate stays honest on re-entry.
  state.killRateEwma = ewmaKillRate(state.killRateEwma,
    p.kills - state.killsAtRateTick, dt, C.POTIONS.ADAPTIVE.TAU);
  state.killsAtRateTick = p.kills;
  // G34/G36: the shared heal budget refills in the finale loop too — the maw
  // fight's lifesteal rides the same rate cap as the normal run.
  state.healBudget = refillHealBudget(
    state.healBudget, dt, p.stats.maxHp, C.HEAL_BUDGET.CAP_FRAC);
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
  // E2 (R9): ground AoE — flyers take nothing (see flyingGuard).
  flyingGuard('blast', () => updateUlts(state, dt));
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
        if (p.hp <= 0) { lastDamageSource = { cause: 'contact', name: 'THE MAW' }; die(true); return; }
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
      if (p.hp <= 0) { lastDamageSource = { cause: 'contact', name: 'THE MAW' }; die(true); return; }
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
      // G34/G36: the finale heal site rides the same shared budget as update().
      const heal = healFromBudget(state.healBudget, dmg * p.stats.lifesteal);
      state.healBudget -= heal;
      p.hp = Math.min(p.stats.maxHp, p.hp + heal);
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
  // M1 (audit 2026-09-16): nothing boss-shaped is left — hand the doctrine
  // back, exactly as mawWithdrew does. Without this the saved pre-boss stance
  // stayed pending and leaked into the NEXT run (startRun did not clear it).
  restoreBossStance();
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

// RSS8 MAGNET COLLECTOR: the live sweep tick. While it runs, every ground drop
// is pulled exponentially toward the player — the credit itself happens ONLY in
// the NORMAL pickup loop inside update() (the one payout path), so collection
// through the sweep is worth exactly collection on foot. When the sweep ends,
// the diff against the cast-time snapshot becomes the visible per-type total;
// items the run's own rules refuse (an over-cap potion, an IGNOREd equip)
// honestly stay on the floor at the player's feet.
//
// WALL-CLOCK slot (the bannerHold/tickNight rule), NOT inside update(): the
// sweep collects XP, and XP levels fire openDraft() — which parks the run in
// 'draft' mode and FREEZES update() mid-sweep (a sweep frozen at 0.25s of 0.45
// never printed its total; the freeze was the bug). Ticking here on realDt
// also makes the streak immune to the earned-moment dilation by construction.
function tickMagnetSweep(realDt) {
  const p = state.player;
  if (!p) return;
  // BOSS-CLEAR SWEEP (msg_01M2R966): ticks on the SAME wall-clock slot and
  // the SAME pull shape as the magnet — the whole freeze-proof argument
  // above applies verbatim (a sweep collecting XP can fire openDraft()
  // mid-sweep and freeze update(); ticking here on realDt is immune). The
  // total is the boss-clear moment's own line, not the magnet's.
  if (p.bossSweep > 0) {
    p.bossSweep -= realDt;
    const bPull = Math.min(1, realDt * C.BOSS_SWEEP.PULL_RATE);
    for (const arr of [state.gems, state.drops, state.itemDrops]) {
      for (const g of arr) { g.x += (p.x - g.x) * bPull; g.y += (p.y - g.y) * bPull; }
    }
    if (p.bossSweep <= 0 && state.bossSweepSnap) {
      const a = state.bossSweepSnap;
      const gems = a.gems - state.gems.length;
      const potions = a.potions - state.drops.reduce((s, d) => s + (d.count || 1), 0);
      const items = a.items - state.itemDrops.length;
      const parts = [];
      if (gems > 0) parts.push(gems + ' GEM' + (gems === 1 ? '' : 'S'));
      if (potions > 0) parts.push(potions + ' POTION' + (potions === 1 ? '' : 'S'));
      if (items > 0) parts.push(items + ' ITEM' + (items === 1 ? '' : 'S'));
      toast(parts.length ? 'BOSS CLEAR SWEEP: ' + parts.join(' \u00b7 ')
        : 'BOSS CLEAR SWEEP: field is clear');
      state.bossSweepSnap = null;
    }
  }
  if (!(p.magnetSweep > 0)) return;
  p.magnetSweep -= realDt;
  const pull = Math.min(1, realDt * C.MAGNET.PULL_RATE);
  for (const arr of [state.gems, state.drops, state.itemDrops]) {
    for (const g of arr) { g.x += (p.x - g.x) * pull; g.y += (p.y - g.y) * pull; }
  }
  if (p.magnetSweep <= 0 && state.magnetSnap) {
    const a = state.magnetSnap;
    const gems = a.gems - state.gems.length;
    const potions = a.potions - state.drops.reduce((s, d) => s + (d.count || 1), 0);
    const items = a.items - state.itemDrops.length;
    const parts = [];
    if (gems > 0) parts.push(gems + ' GEM' + (gems === 1 ? '' : 'S'));
    if (potions > 0) parts.push(potions + ' POTION' + (potions === 1 ? '' : 'S'));
    if (items > 0) parts.push(items + ' ITEM' + (items === 1 ? '' : 'S'));
    toast(parts.length ? 'MAGNET SWEEP: ' + parts.join(' \u00b7 ') : 'MAGNET SWEEP: nothing to collect');
    state.magnetSnap = null;
  }
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
  // FULLSCREEN: the transient button outlives the last interaction by
  // C.FULLSCREEN.HIDE_S of WALL-CLOCK time (same rule as the banner hold —
  // frame-rate independent, never frame-counted, and it keeps decaying in
  // modes that early-return below so a parked window can never strand). It
  // decays BEFORE syncChrome() publishes visibility so the painted state and
  // the timer never disagree by a frame.
  if (fsOverlay.t > 0) fsOverlay.t = Math.max(0, fsOverlay.t - realDt);
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
  // G30 AUTO DRAFT AUTO-PICK: wall-clock countdown on the frame loop ('draft'
  // mode freezes the sim, so this cannot ride update()). Suspend-aware and
  // AUTO-only; a no-op in every other mode.
  tickDraftAutoPick(realDt);
  // DRAFT PICK CEREMONY: same wall-clock slot — the overlay teardown after a
  // resolved draft. A no-op in every other mode.
  tickDraftCeremony(realDt);
  // NIGHT MODE: the intermission auto-CONTINUE + the end-card auto-RETRY,
  // same wall-clock slot (mode-gated no-ops in every other mode).
  tickNight(realDt);
  // RSS8: the magnet sweep ticks on the same wall-clock slot (see
  // tickMagnetSweep — it must keep running while a level-up draft parks the sim).
  tickMagnetSweep(realDt);
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
    renderer.fsButton = null;   // SEAM HYGIENE: see the death-cine branch
    const t = now - cineT0;
    CINE.render(renderer.ctx, t);
    const cph = CINE.phaseAt(t);
    if (cph !== lastCinePhase) { lastCinePhase = cph; audio.playPortalCue(cph); }
    if (CINE.isDone(t)) endPortalCine();
    requestAnimationFrame(frame);
    return;
  }
  if (state.mode === 'death-cine') {
    // G15: the death movie — frozen like the other movies, wall-clock driven
    // (frame-rate parity by construction), cause-flavored from the recorded
    // death source. isDone hands back to the composed payoff overlay.
    // SEAM HYGIENE (2026-09-18, caught live by test_fullscreen_button's
    // enlarged-hit-box loop): these movie branches early-return BEFORE
    // renderer.render(), so a seam like fsButton keeps its last playing-frame
    // value through the whole movie — the canvas is honestly repainted, but
    // the seam reads as if the button were still up (a test flake whenever
    // the pilot dies inside a hide-window). Clear it: nothing is live here.
    renderer.fsButton = null;
    const t = now - deathCineT0;
    DCINE.render(renderer.ctx, t, state.deathBy ? state.deathBy.cause : 'unknown');
    if (DCINE.isDone(t)) endDeathCine();
    requestAnimationFrame(frame);
    return;
  }
  // V1: the escape owns the canvas like the movies do — the overhead world
  // render, the HUD and the touch pads all stand down for the change of pace
  // (chromeOn already excludes every mode but playing/finale). realDt, NOT
  // the earned-moment dt: the escape keeps a steady clock by design.
  if (state.mode === 'escape') {
    renderer.fsButton = null;   // SEAM HYGIENE: see the death-cine branch
    // HELP MODE (VK9P4): the pause is the player's own invitation — same
    // freeze the playing branch grants, so reading the reference mid-escape
    // never costs wall-clock distance (the horde is the timer).
    ESCAPE.frame(renderer.ctx, state.helpMode ? 0 : realDt);
    requestAnimationFrame(frame);
    return;
  }
  // `dt` (real * earned-moment time scale) was computed at the top of frame().
  if (state.mode === 'playing') {
    // WAVE-21: stage-2 coachmarks PAUSE the sim (a live fight running behind
    // a dimming overlay is confusing — the game plays itself otherwise).
    // ONBOARDING REWORK: hints/tags tick on the frame's dt and NEVER gate the
    // sim — update() runs regardless of what the strip is doing (invariant 1).
    // HELP MODE: the pause is the player's own invitation (their "?" armed
    // it) — same freeze, and leaving resumes the clock without a trace.
    if (!coachActive() && state.bannerHold <= 0 && !state.helpMode) update(dt);
    updateOnboarding(dt);
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
  // MANUAL v2 seam: page turns through the real renderer (goto re-draws the
  // whole stack — indicator, nav, contents, footer).
  manual: { next: manualNext, prev: manualPrev, goto: manualGoto },
  // M3: the ground-item overflow wrappers (test seam — the same functions the
  // kill funnel and drop events call).
  m3: { pushGem, pushDrop, pushItemDrop },
  // ONBOARDING seam: the live hint strip engine + the flag store, so tests
  // drive the REAL layer (never a copy of its rules). The object-tag engine
  // was REMOVED (2026-09-16) — there is deliberately no tags seam anymore.
  onboarding: {
    strip: hintStrip,
    store: hintStore,
    shownRun: () => hintShownRun,
    reset: resetOnboarding,
    // PER-CONTROL INTRODUCTIONS seams: the scheduler's gate state (tests
    // drive the REAL pacing), the demonstration hook, and the live
    // touch-path read (tests flip it by toggling #touch's 'on' class).
    pending: () => hintPending.map(h => h.id),
    spacing: HINT_SPACING_S,
    lastShownAt: () => hintLastShownAt,
    // PLAYER REVIEW item 1 seams: the skip-suppression state + the REPLAY
    // TOUR re-arm (the settings card calls this same function).
    suppressed: () => hintsSuppressed,
    replayRearm: () => { hintsSuppressed = false; },
    controlUsed,
    bossFightLive,
    touchPath: isTouchPath,
  },
  // N1a: the Q-slot seam — the class's own skill id, and the key act that
  // routes through it (so a probe casts what the button casts).
  classSkillId, runAction,
  // HELP MODE seam: arm/leave, the touch-layer probe and the world-object
  // pick (the same functions the real funnels route through), plus the
  // camera projections — the retirement/inertness probes drive the REAL
  // interception, never a copy of its rules.
  helpmode: {
    enter: enterHelpMode, leave: leaveHelpMode,
    probe: helpProbe, pick: pickHelpObject, screenToWorld,
    region: (x, y, r) => worldRegion(x, y, r || 8),
    objectText: (id) => { const o = helpObject(id); return o ? o.name + ' — ' + o.purpose : null; },
  },
  renderer, openStats, closeStats,
  // WAVE-17 settings-cog seam: in-run open/close (pause contract probes).
  openSettings, closeSettings,
  // G9 trophy-gallery seam: open/close (the mode + return-mode contract) and
  // step (the ring, so a test can wrap 21 entries without a DOM click per
  // entry). chromeOn is exposed so the pad-layer gate for the new mode is
  // asserted directly, not inferred from a style string.
  openTrophies: showTrophies, closeTrophies, trophiesStep, chromeOn,
  // ---- FULLSCREEN seam (owner 2026-09-17): the support probe, the 0.5s
  // window (bump/visible), the toggle, the button's view-rect and its CSS
  // projection (canvasRegion — the same math the coachmark spotlights use),
  // and the hit-test itself, so tests drive the REAL paths.
  fullscreen: {
    supported: () => fsMode() !== 'none',
    mode: fsMode,
    visible: fsVisible,
    bump: fsBump,
    toggle: toggleFullscreen,
    rect: fsButtonRect,
    hitRect: fsHitRect,
    rectCss: (x, y, w, h) => canvasRegion(x, y, w, h).getBoundingClientRect(),
    hit: fsHit,
    // Immersive fallback seams (addendum): live state, the exit path, the
    // address-bar nudge count, and the once-per-session A2HS hint flag.
    immersive: () => immersiveOn,
    leave: () => applyImmersive(false),
    reapplies: () => fsReapplies,
    hintShown: () => immersiveHintShown,
  },
  // G10 bestiary seam: open/close (the mode + return-mode contract) and step
  // (the ring, so a test can wrap every display id without a DOM click per
  // entry) — same shape as the gallery seam above.
  openBestiary: showBestiary, closeBestiary, bestiaryStep, bestiaryDisplayIds,
  // G25 slice 2 apex-gallery seam: open/close (the mode + return-mode
  // contract) and step (the ring, so a test can wrap the catalogue without a
  // DOM click per entry) — same shape as the gallery seam above. The showcase
  // itself is measured off renderer.trophyShowcase (the REUSED G9 seam).
  openApexGallery: showApexGallery, closeApexGallery, apexStep, apexGalleryModel,
  // G23/G11 filter seam: read the live filter, cycle it through the REAL
  // card/key path (guarded to the bestiary mode).
  bestiaryFilter: { get: () => state.bestiaryFilter, cycle: cycleBestiaryFilter },
  hudText: { get: hudTextEnabled, set: setHudTextEnabled },
  // ---- G12 title-screen seams: the screen itself (showTitle re-renders the
  // REAL startup menu), the no-local-save test the LOAD FROM DISK card rides
  // on, and the honest-exit contract (the step log + the two screens).
  showTitle, hasLocalSave,
  // ---- v9 WHAT'S NEW seam: the pure gates (matrix-testable), the live release
  // constant, the card add/dismiss pair, and the once-per-launch flag — so the
  // suite can drive the REAL title path without scraping for the card.
  // veteranDue is the ADDENDUM's one-off-run gate (keys off lastSeenUpdate).
  whatsNew: {
    due: whatsNewDueFor,
    veteranDue: veteranIntroDueFor,
    release: WHATS_NEW,
    add: addWhatsNewCard,
    dismiss: dismissWhatsNew,
    get tried() { return whatsNewTried; },
    set tried(v) { whatsNewTried = !!v; },
  },
  // ---- G26 pre-run-loadout seam: the screen, the live stored choice, and the
  // validated kit startRun will arm (so a test compares the menu's state
  // against the SAME chain the run applies — never the menu's bookkeeping).
  loadout: {
    open: showLoadout,
    get chosen() { return profile.loadout; },
    kit: chosenLoadout,
    choices: loadoutChoices,
    slotCap: loadoutSlotCap,
  },
  // ---- SHOP PAGING seam (owner 2026-09-18): the screen, the PURE grid/page
  // planners (matrix-testable without a layout engine — the uiFitScale
  // precedent), the named constants, and the live pager state + turn (the
  // same functions the arrows, the swipe and the keys drive).
  shop: {
    open: showShop,
    plan: shopGridPlan,
    chunk: shopPageChunk,
    caps: { gap: SHOP_GAP, cardCap: SHOP_CARD_CAP, minCols: SHOP_MIN_COLS,
            maxCols: SHOP_MAX_COLS, indH: SHOP_IND_H },
    active: () => !!shopPager,
    page: () => (shopPager ? shopPager.page : null),
    pages: () => (shopPager ? shopPager.pages.length : null),
    goto: shopPageGoto,
    wanted: () => shopPageWanted,
  },
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
  // M1 map seam: the live flag + the ONE toggle the M key and the MAP touch
  // button both drive. The painted frame is renderer.atlasMap's seam (null
  // while closed — the "restore proof" half of the toggle contract).
  map: { get open() { return state.mapOpen; }, toggle: toggleMap },
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
  // FIRST-RUN PROLOGUE seam: the live phase, the banner copy/engine, the OK
  // act (the same function the canvas hit-region calls), the drink payoff,
  // and the layout the hit-test reads — tests drive the REAL paths.
  prologue: {
    get active() { return !!state.prologue; },
    get ran() { return state.prologueRan; },
    get potion() { return state.prologue ? { ...state.prologue.potion } : null; },
    get t() { return state.prologue ? state.prologue.t : null; },
    get walkT() { return state.prologue ? state.prologue.walkT : null; },
    get bannerIdx() { return state.prologue ? state.prologue.bannerIdx : null; },
    get paused() { return !!prologueBanner(); },
    banners: PROLOGUE_BANNERS,
    banner: prologueBanner,
    ok: prologueOk,
    okRect: prologueOkRect,
    skip: prologueSkip,
    skipRect: prologueSkipRect,
    drink: () => prologueDrink(state.player),
    end: endPrologue,
    // STAGED INTRODUCTION: the reveal state, the live tooltip kind, the
    // stage table and the tip texts — tests drive the REAL reveal paths.
    get revealed() { return state.prologue ? { ...state.prologue.revealed } : null; },
    get tip() { return state.prologue ? state.prologue.tip : null; },
    stages: PROLOGUE_STAGES,
    tipText: prologueTipText,
    get shieldT() { return state.prologueShieldT; },
    // The all-buttons-disabled lock (addendum 2026-09-18): the live DOM state.
    get buttonsLocked() {
      const body = typeof document !== 'undefined' && document.body;
      return !!(body && body.classList && body.classList.contains &&
        body.classList.contains('prologue-locked'));
    },
  },
  setPilotMode: swapPilotMode, pilotInput,
  // G31: the persistence seam — the real storage object plus the real
  // load/apply helpers (tests mutate storage and re-run startRun, exactly
  // what a reload does).
  pilotPrefs: {
    storage: prefStorage,
    loadPilot: loadPilotPref,
    loadStance: loadStancePref,
    applyStance: applyStancePref,
    KEY_PILOT, KEY_STANCE,
  },
  // ---- NIGHT MODE seam: the session toggle + two-press arm, the run stamp,
  // the pure draft policy, the live auto-advance timers, and the return
  // summary — so every night behaviour is drivable headlessly through the
  // real paths (never copies).
  night: {
    get on() { return state.night; },
    get run() { return state.nightRun; },
    get armed() { return nightArmed; },
    press: toggleNight,
    get summary() { return state.nightSummary; },
    pickIndex: nightDraftPickIndex,
    get continueLeft() { return nightContinueLeft; },
    get restartLeft() { return nightRestartLeft; },
    get evolveLeft() { return nightEvolveLeft; },
    // Watchdog seam: the live stall clock (null mode = not stalled) and a
    // direct probe for the unstick action, so tests drive the REAL backstop.
    get stall() { return { mode: nightStall.mode, t: nightStall.t }; },
    unstick: nightUnstick,
    get constants() {
      return { CONTINUE_S: C.AUTOPILOT.NIGHT_CONTINUE_S,
        RESTART_S: C.AUTOPILOT.NIGHT_RESTART_S,
        EVOLVE_S: C.AUTOPILOT.NIGHT_EVOLVE_S,
        STALL_S: C.AUTOPILOT.NIGHT_STALL_S,
        PENALTY_PCT: RUN_GOLD.NIGHT_PENALTY_PCT };
    },
  },
  // ---- E1 RUN PURSE seam: the live wallet plus the REAL credit / spend /
  // settle functions the game loop itself calls (never copies) — a headless
  // test drives the SAME code path a kill, a shrine walk and a run end drive.
  purse: {
    get: () => purseClamp(profile.runPurse),
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
  // FLOATING JOYSTICK seam (2026-09-18): tryArm/release/armed/origin/captures
  // + the live DOM elements, so the guard drives the REAL canvas path and
  // asserts the visual without touching main.js internals.
  get fjoy() { return fjoyApi; },
  // CONTROL BANDS seam (2026-09-18): the PURE band-fit arithmetic, so the
  // node suite can matrix-test the zero-overlap math without a layout
  // engine (the real-browser proof is tools/verify_control_bands.mjs).
  get bandFit() { return bandFit; },
  // UI-FIT seam (2026-09-18, msg_01M2S72CF4): the pure scale arithmetic +
  // the live applied state, so the node suite can matrix-test the clip math
  // and the browser verifier can report the engaged scale directly.
  get uiFitScale() { return uiFitScale; },
  get uiFit() { return { ...uiFitState, applied: uiScaleNow, fellBack: lastFitFellBack }; },
  // CANVAS LADDER seam (2026-09-18, msgs 78PTR/7BRBS/9MV7F): the measured
  // persistent/transient canvas heights + gain, the engaged flags, the pure
  // decision + abbreviation functions, and a pinned-ladder override so a
  // verifier can A/B the SAME viewport with the ladder off and on.
  get ladder() {
    return { transient: topTransient, compact: padsCompact,
      measure: ladderMeasure && { ...ladderMeasure }, override: ladderOverride };
  },
  setLadderOverride(v) { ladderOverride = v; fitCanvas(); },
  ladderDecide, pilotBadgeText,
  viewSize,
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
  // G25 slice 1: the text-HUD block (same string the DOM node renders), so
  // the APEX MARK flourish is assertable by STRING equality — a run with the
  // mark off must be byte-identical to the pre-apex output.
  hudTextBlock,
  synergyHintForCard,
  openDraft,
  // Arrow-cursor seam: where the keyboard cursor sits on the offer row
  // (headless tests read this instead of poking module scope). The R2
  // inspect seam is gone with the inspect box — one activation takes the card.
  draftFocus: () => draftFocus,
  // ---- G30 AUTO DRAFT AUTO-PICK seam: the countdown's observable state, an
  // rng injection point (a pinned-index test drives the SAME draw the live
  // loop makes), and the suspend state. Never read by the browser page.
  draftAuto: {
    set rng(fn) { draftAutoRng = fn; },
    get count() { return draftAutoCount; },
    get lastId() { return draftAutoLastId; },
    get left() { return draftTimer ? draftTimer.left : null; },
    get armed() { return !!draftTimer; },
  },
  // ---- DRAFT PICK CEREMONY seam: the one timing constant + the one
  // class-name pair the CSS (index.html) and the tests agree on, plus the
  // live state, so a headless probe can assert markers/teardown without
  // timers. Never read by the browser page.
  ceremony: {
    S: DRAFT_CEREMONY_S,
    classes: { chosen: CEREMONY_CHOSEN_CLS, others: CEREMONY_BURN_CLS, flag: CEREMONY_FLAG_CLS },
    get active() { return !!draftCeremony; },
    get left() { return draftCeremony ? draftCeremony.left : null; },
  },
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
  // ---- V1 escape seam: start the mode through the REAL hand-over (the same
  // startEscape the portal-cine hook calls), read its live sim (clock, mode,
  // pressure), drive the skip, and step it headlessly — so tests and the
  // browser verifier prove the integrated path, never a copy of it.
  escape: {
    start: startEscape,
    begin: ESCAPE.begin,      // seeded hand-over (the no-stats trace test drives this)
    get mode() { return state.mode; },
    get sim() { return ESCAPE.current(); },
    skip: ESCAPE.skip,
    frame: ESCAPE.frame,
    onKey: ESCAPE.onKey,
    pointer: ESCAPE.pointer,
    pointerUp: ESCAPE.pointerUp,
    explain: ESCAPE.explain,
    isAuto: ESCAPE.isAuto,
    get payload() { return ESCAPE.payload(); },
  },
  // ---- G15 death-movie seam: the same start/end the real die()/skip path
  // drives, plus the clock — tests and the browser verifier prove the
  // integrated hand-off, never a copy of it.
  deathCine: {
    start: startDeathCine,
    end: endDeathCine,
    get t() { return performance.now() - deathCineT0; },
    duration: DCINE.CINE_DURATION,
  },
  // ---- G16 portal-cine seam: the same read-only clock the G15 death movie
  // exposes — start/end stay internal (the real boss-kill path drives them);
  // the browser verifier samples the PAUSE/LINGER beats off this t.
  portalCine: {
    get t() { return performance.now() - cineT0; },
    duration: CINE.CINE_DURATION,
  },
};
