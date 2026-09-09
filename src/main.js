// HORDES — auto-playing survivors-like. Entry point & game loop.
import { CONFIG as C, UPGRADES } from './config.js';
import { makePlayer, makeProjectile, makeGem, hpScale, xpScale, dmgScale } from './entities.js';
import { Renderer } from './render.js';
import { AutoPilotController } from './controllers.js';
import { useSkill, usePotion, updateResources } from './skills.js';
import { rollItem, equipOrExchange, applyAffixes, STAT_DEFAULTS, MAX_EQUIPPED, PAID_CHESTS, rollPaidChest } from './loot.js';
import { spawnArch, tickArches, activeArchMods, ARCH_TYPES } from './arches.js';
import {
  WEAPON_TYPES, makeWeapon, updateWeapons, WEAPON_NAMES, WEAPON_MAX_LEVEL,
  levelUpWeapon, describeWeaponLevel, collectWeaponXp, weaponLevelParams,
} from './weapons.js';
import { ENEMY_TYPES, makeTypedEnemy, decideEnemyAction, rollVariant, deathShockwave } from './enemy_types.js';
import { maybeSpawnChest, tickChests } from './chests.js';
import {
  rollWeather, initWeather, update as updateWeather, mods as weatherMods, windDrift, mulberry32,
} from './weather.js';
import { evolveWeapon, describeEvolution, EVOLUTION_DEFS } from './evolutions.js';
import { pickBossForWave, decideBossAction } from './bosses.js';
import { rollChoices, applyChoice } from './choices.js';
import * as INTRO from './intro.js';
import * as CINE from './portal_cine.js';
import {
  HEAT_CAP, HEAT_CURVES, heatMultipliers, goldMult, describeHeat, heatOf,
  manualPushes, addHeat, initHeat,
} from './heat.js';
import {
  loadProfile, saveProfile, makeProfile, computeRunGold,
  SHOP_UPGRADES, upgradeCost, buyUpgrade, startWeaponSlots,
  CHARACTERS, unlockCharacter, equipCharacter,
  applyMetaBonuses, applyCharacter, startPotionCount, hasArcadePass,
} from './meta.js';

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
// Internal resolution stays CONFIG.VIEW_W x VIEW_H; only the CSS size changes
// (with image-rendering: pixelated). Re-run on orientation change / resize.
function fitCanvas() {
  if (!window.innerWidth || !canvas.style) return; // stub/headless guard
  const scale = Math.min(window.innerWidth / C.VIEW_W, window.innerHeight / C.VIEW_H);
  canvas.style.width = Math.floor(C.VIEW_W * scale) + 'px';
  canvas.style.height = Math.floor(C.VIEW_H * scale) + 'px';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ---------- State ----------
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
  toasts: [],        // transient HUD messages ({ msg, ttl })
  time: 0,
  spawnTimer: 0,
  // 'intro' plays the wave-7/D movie before the menu; 'evolve' is the
  // EVOLUTION draft overlay (a maxed weapon + its item kind + a token).
  mode: 'menu',      // 'menu' | 'intro' | 'playing' | 'draft' | 'evolve' | 'intermission' | 'dead'
  pendingDrafts: 0,
  cam: { x: 0, y: 0 },
  character: null,   // equipped CHARACTERS entry for the current run
  weaponSlots: 6,    // per-run slot cap (startWeaponSlots(profile) in startRun)
  baseWeaponSlots: 6, // pre-choice slot base (Merchant's Pact adds on top)
  weather: null,     // per-run weather instance (weather.js, rolled in startRun)
  groundSeed: 1,     // per-run ground-decor field seed (render.js, rolled in startRun)
  evoTokens: 0,      // evolution tokens (chests.js legendary tokenOffer grants)
  choiceSeed: 1,     // per-run seed for the intermission blessing/curse rolls
  choiceRng: null,   // mulberry32(choiceSeed) — deterministic per run
  takenChoices: [],  // choice ids taken this run (repeat-free offers)
  pendingChoiceOffers: null, // this wave's 3 rolled cards (null = roll fresh)
  wave: { num: 1, endsAt: 120, boss: null, bosses: [], pendingClear: false, startKills: 0, cinePending: false },
};
state.player.x = C.VIEW_W / 2;
state.player.y = C.VIEW_H / 2;

// ---------- Meta profile (persistent, meta.js owns the shape/storage) ----------
let profile = loadProfile();

// ---------- Character controller seam (see controllers.js) ----------
const controller = new AutoPilotController();

function runController(p, dt, am) {
  const decision = controller.decide(p, state, C.PLAYER);
  // Movement. Loot speedMult (Windwalker boots) + SWIFT/BERSERK arch mods
  // multiply the base speed (controller decides WHERE, stats say HOW FAST).
  const spd = p.stats.speed * (p.stats.speedMult || 1) * am.speedMult;
  if (decision.moveX !== 0 || decision.moveY !== 0) {
    p.x += decision.moveX * spd * dt;
    p.y += decision.moveY * spd * dt;
  }
  // Keep the player roughly on the field.
  p.x = Math.max(-600, Math.min(600, p.x));
  p.y = Math.max(-600, Math.min(600, p.y));
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
    const n = Math.min(p.stats.projectiles + (P.proj || 0), C.WEAPON.MAX_PROJECTILES);
    const volleyDmgMult = (P.dmgMult || 1) * (1 + 0.2 * (P.proj || 0)) *
      (p.stats.damageMult || 1) * am.damageMult *   // loot Brutal Edge + BERSERK arch
      (volleyEvo && volleyEvo.affixes.damageMult || 1);
    const volleyPierceAll = !!(volleyEvo && volleyEvo.flags.includes('pierceAll'));
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * C.WEAPON.SPREAD;
      const a = baseAng + spread;
      const pr = makeProjectile(p.x, p.y, Math.cos(a), Math.sin(a), p.stats);
      pr.damage *= volleyDmgMult;
      if (volleyPierceAll) pr.pierce = 999;
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
function pickSpawnType(wave) {
  const S = C.SPAWNER;
  const entries = [['CHASER', S.CHASER_WEIGHT]];
  if (wave >= S.SWARMER_WAVE) entries.push(['SWARMER', S.SWARMER_WEIGHT]);
  if (wave >= S.BRUTE_WAVE) entries.push(['BRUTE', S.BRUTE_WEIGHT]);
  if (wave >= S.DASHER_WAVE) entries.push(['DASHER', S.DASHER_WEIGHT]);
  if (wave >= S.SPITTER_WAVE) entries.push(['SPITTER', S.SPITTER_WEIGHT]);
  if (wave >= S.WARLOCK_WAVE) entries.push(['WARLOCK', S.WARLOCK_WEIGHT]);
  if (wave >= S.TICK_WAVE) entries.push(['TICK', S.TICK_WEIGHT]);
  if (wave >= S.COLOSSUS_WAVE) entries.push(['COLOSSUS', S.COLOSSUS_WEIGHT]);
  let r = Math.random() * entries.reduce((s, e) => s + e[1], 0);
  for (const [id, w] of entries) { if ((r -= w) < 0) return id; }
  return 'CHASER';
}

// Re-scale a freshly-made typed enemy onto the ESCALATION curves: back out
// enemy_types.js's linear multipliers (1+0.35w hp / 1+0.25w xp) and apply the
// steeper documented curves from CONFIG.ESCALATION instead. WAVE-9: HEAT
// stacks multiplicatively AFTER the wave escalation (hp only — xp/gold are
// never heat-inflated).
function applyEscalation(e, t) {
  const w = Math.floor(t / 30);
  const hpMult = e.hp / (C.ENEMY.BASE_HP * (1 + w * 0.35));
  const xpMult = e.xp / (C.ENEMY.BASE_XP * (1 + w * 0.25));
  const hp = C.ENEMY.BASE_HP * hpScale(w) * hpMult * heatMultipliers(heatOf(state)).hp;
  e.hp = hp;
  e.maxHp = hp;
  e.xp = C.ENEMY.BASE_XP * xpScale(w) * xpMult;
}

function spawnWave(dt) {
  if (state.portal) return;   // breather while the portal is open (no spawns)
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  // WAVE-9: heat speeds the spawn clock (interval / spawnRate).
  const interval = Math.max(0.25,
    (C.ENEMY.SPAWN_INTERVAL - state.time * 0.008) / heatMultipliers(heatOf(state)).spawnRate);
  state.spawnTimer = interval;
  // Groups, not individual enemies: a group is one spawn slot that pops a
  // pack (swarmers spawn packSize at once, others pop 1).
  const groups = Math.max(1, Math.ceil((1 + Math.floor(state.time / 25)) / 2));
  const wave = Math.floor(state.time / 30);
  for (let i = 0; i < groups; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = C.ENEMY.SPAWN_DIST * (0.85 + Math.random() * 0.3);
    const typeId = pickSpawnType(wave);
    // TICK pops in latches of TICK_PACK (packSize lives in hb4's module and
    // ticks don't set one); everything else uses its own packSize hint.
    const pack = typeId === 'TICK' ? C.SPAWNER.TICK_PACK : (ENEMY_TYPES[typeId].packSize || 1);
    for (let j = 0; j < pack; j++) {
      const pa = a + (j - (pack - 1) / 2) * 0.12;
      const elite = state.time >= C.SPAWNER.ELITE_TIME &&
        typeId !== 'COLOSSUS' &&                       // colossus IS the mini-boss
        Math.random() < C.SPAWNER.ELITE_CHANCE;
      const e = makeTypedEnemy(typeId,
        state.player.x + Math.cos(pa) * d,
        state.player.y + Math.sin(pa) * d,
        state.time, { elite, variant: rollVariant(typeId) });
      applyEscalation(e, state.time);
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

// WAVE-9 heat charge point: every pickup/equip routes through here. A FREE
// slot costs +1 heat (NEW_ITEM_SLOT); the 4/4 exchange is FREE (Sk408's hard
// rule — the pilot exchanges constantly). A fresh item kind may complete an
// evolution's requirements either way, so declined offers re-arm.
function equipOrExchangeItem(it) {
  const res = equipOrExchange(state.items, it);
  if (!res) return;
  const p = state.player;
  if (res.status === 'exchanged') {
    removeItemAffixes(p, res.removed);
    addHeat(state, 'ITEM_EXCHANGE');
    toast('EXCHANGED ' + res.removed.name.toUpperCase() + ' -> ' + it.name.toUpperCase() +
      ' [' + it.rarity + ']');
  } else {
    addHeat(state, 'NEW_ITEM_SLOT');
    toast('EQUIPPED ' + it.name.toUpperCase() + ' [' + it.rarity + ']');
  }
  applyItemAffixes(p, it);
  for (const w of state.weapons) w.evoDeclined = false;
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

// Merchant's Pact curse: run-scoped price multiplier on the paid chests.
function shopPriceMult() {
  return (state.player.choices && state.player.choices.shopPriceMult) || 1;
}
function chestCost(def) {
  return Math.round(def.cost * shopPriceMult());
}

function openIntermission() {
  // WAVE-8/A: if the final boss died but the movie hasn't played yet (a
  // draft/evolve from the boss payout delayed its start), the intermission
  // cannot preempt it — play the movie; it re-enters here when it ends.
  if (state.wave.cinePending) { startPortalCine(); return; }
  state.portal = null;
  openMenu();
  state.mode = 'intermission';
  const p = state.player;
  const waveKills = p.kills - (state.wave.startKills || 0);
  ovTitle.textContent = 'WAVE ' + state.wave.num + ' CLEARED';
  ovTitle.className = 'logo';
  ovSub.innerHTML =
    `WAVE ${state.wave.num} CLEARED · survived ${Math.floor(state.time)}s<br>` +
    `wave kills: ${waveKills} · level ${p.level} · ITEMS ${state.items.length}/${MAX_EQUIPPED}` +
    `${state.evoTokens > 0 ? ` · TOKENS ${state.evoTokens}` : ''}` +
    `<br>purse: ${profile.gold} gold${interMsg ? '<br>' + interMsg : ''}`;
  menuCard('CONTINUE', 'into wave ' + (state.wave.num + 1) + ' [C]', () => continueRun());
  for (const [tier, def] of Object.entries(PAID_CHESTS)) {
    const cost = chestCost(def);
    const el = menuCard(tier + ' CHEST',
      `${cost} gold · gamble an item (${Math.round(def.nothingChance * 100)}% nothing)` +
      (shopPriceMult() !== 1 ? ' · CURSED PRICES' : ''),
      () => buyPaidChest(tier), profile.gold < cost);
    if (profile.gold < cost) el.onclick = () => audio.playSfx('button');
  }
  // The wave's blessing/curse offers: rolled once per wave (re-renders after
  // a chest buy reuse the same pending set; taken ones drop off).
  if (!state.pendingChoiceOffers) {
    state.pendingChoiceOffers = rollChoices(state.wave.num, state.choiceRng || Math.random,
      state.takenChoices);
  }
  for (const offer of state.pendingChoiceOffers) {
    menuCard(offer.title.toUpperCase(),
      `${offer.rarity} BLESSING · ${offer.desc}`,
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
}

function takeChoice(offer) {
  applyChoice(state.player, offer);
  state.takenChoices.push(offer.id);
  state.pendingChoiceOffers = state.pendingChoiceOffers.filter(o => o !== offer);
  // Merchant's Pact: weaponSlotBonus widens the per-run slot cap (bounded by
  // the absolute CONFIG cap).
  const bonus = (state.player.choices && state.player.choices.weaponSlotBonus) || 0;
  state.weaponSlots = Math.min(C.WEAPON_SLOTS, state.baseWeaponSlots + bonus);
  interMsg = `BLESSING TAKEN: ${offer.title} — ${offer.desc}`;
  audio.playSfx('levelup');
  openIntermission();   // re-render: offers + gold line refresh
}

function buyPaidChest(tier) {
  const def = PAID_CHESTS[tier];
  const cost = chestCost(def);
  if (profile.gold < cost) return;
  const res = rollPaidChest(profile, tier);
  if (!res.ok) return;
  // rollPaidChest debits the BASE cost; the Merchant's Pact surcharge is
  // taken here so loot.js stays untouched.
  profile.gold -= cost - def.cost;
  saveProfile(profile);
  if (res.gambled === 'item' && res.item) {
    const it = res.item;
    const eq = equipOrExchange(state.items, it);
    if (eq) {
      if (eq.status === 'exchanged') {
        removeItemAffixes(state.player, eq.removed);
        addHeat(state, 'ITEM_EXCHANGE');
        interMsg = `CHEST: EXCHANGED ${eq.removed.name} -> ${it.name} [${it.rarity}]`;
      } else {
        addHeat(state, 'NEW_ITEM_SLOT');
        interMsg = `CHEST: EQUIPPED ${it.name} [${it.rarity}] (${it.affixes.map(a => a.name).join(', ')})`;
      }
      applyItemAffixes(state.player, it);
      for (const w of state.weapons) w.evoDeclined = false;   // kind may complete an evo
    } else {
      interMsg = `CHEST: ${it.name} LOST — no slots`;
    }
  } else {
    interMsg = 'THE CHEST WAS EMPTY... ' + res.debited + ' gold gone';
  }
  audio.playSfx('chest');
  openIntermission();   // re-render: gold balance + dim states refresh
}

function continueRun() {
  const p = state.player;
  state.wave.num++;
  state.wave.endsAt = state.time + C.ESCALATION.WAVE_LENGTH;
  state.wave.startKills = p.kills;
  state.wave.bosses = [];
  state.wave.boss = null;
  state.portal = null;
  state.pendingChoiceOffers = null;   // next wave rolls a fresh set
  interMsg = '';
  spawnWaveArches();
  state.mode = 'playing';
  overlay.style.display = 'none';
  toast('WAVE ' + state.wave.num + ' - THE HORDE GROWS');
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
    applyEscalation(boss, state.time);
    const hp = C.ENEMY.BASE_HP * hpScale(w) *
      (B.HP_MULT_BASE + B.HP_MULT_PER_WAVE * state.wave.num) * desc.hpMult *
      heatMultipliers(heatOf(state)).hp;   // WAVE-9: bosses take the heat too
    boss.hp = hp;
    boss.maxHp = hp;
    boss.w = Math.round(boss.w * B.SIZE_MULT * desc.sizeMult);
    boss.h = Math.round(boss.h * B.SIZE_MULT * desc.sizeMult);
    boss.speed *= B.SPEED_MULT * desc.speedMult;
    boss.contactDamageMult = (boss.contactDamageMult || 1) * (desc.contactDamageMult || 1);
    boss.xp = C.ENEMY.BASE_XP * xpScale(w) * B.XP_KILLS;  // worth ~10 kills
    boss.boss = true;
    boss.bossId = desc.id;          // decideBossAction dispatch key
    boss.name = desc.name;          // announce + HUD
    boss.flavor = desc.flavor;
    boss.bossSprite = desc.sprite;  // render.js draws this grid (BOSS_SPRITES)
    boss.age = 0;                   // pattern brains phase off age
    state.enemies.push(boss);
    state.wave.bosses.push(boss);
  });
  // Named announce: BOTH names on double waves (3/6/9 — the events).
  toast(cast.map(b => b.name).join(' + ') + (cast.length > 1 ? ' APPROACH!' : ' APPROACHES!'));
}

// ---------- Update ----------
function update(dt) {
  const p = state.player;
  state.time += dt;
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
    // Portal chases the player (chest precedent) so the AutoPilot crosses it
    // without touching the controller seam. It moves 60px/s faster than the
    // player's CURRENT speed — Light Boots stacks (observed 211px/s in sims)
    // would otherwise outrun a fixed-speed portal forever.
    const po = state.portal;
    po.age += dt;
    const dx = p.x - po.x, dy = p.y - po.y;
    const len = Math.hypot(dx, dy) || 1;
    const poSpd = p.stats.speed * (p.stats.speedMult || 1) * am.speedMult + C.PORTAL.SPEED;
    po.x += (dx / len) * poSpd * dt;
    po.y += (dy / len) * poSpd * dt;
    if (len < C.PORTAL.RADIUS) { openIntermission(); return; }
  }
  spawnWave(dt);
  // Wave timer: countdown to the boss(es); the timer PAUSES while any boss
  // lives or the portal is open; the next wave starts at the intermission
  // CONTINUE (portal walk-in), not at boss death.
  state.wave.boss = (state.wave.bosses || []).find(b => b.hp > 0) || null;
  if (!state.wave.boss && !state.portal && state.time >= state.wave.endsAt) spawnBoss();
  updateResources(p, dt);
  // Meta Mana Spring bonus (applyMetaBonuses adds stats.manaRegen) + the
  // MOONLIGHT weather bonus (manaRegenMult on the base regen).
  const regenBonus = (p.stats.manaRegen ?? C.MANA.REGEN) - C.MANA.REGEN;
  if (regenBonus > 0) p.mana = Math.min(p.stats.maxMana, p.mana + regenBonus * dt);
  if (wm.manaRegenMult && wm.manaRegenMult !== 1) {
    p.mana = Math.min(p.stats.maxMana, p.mana + C.MANA.REGEN * (wm.manaRegenMult - 1) * dt);
  }
  updateWeapons(state, state.weapons, dt);

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
    pr.x += pr.vx * dt + wd.x * dt; pr.y += pr.vy * dt; pr.age += dt;
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
  const dmgMult = dmgScale(Math.floor(state.time / 30)) * heatMultipliers(heatOf(state)).damage;
  let touchDmg = 0;
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
      p.hp -= act.drain * dt;        // DoT: no invuln window, just bleed
      if (p.hp <= 0) { die(); return; }
    }
    if (act.fire) {
      state.enemyShots.push({
        x: e.x, y: e.y,
        vx: act.fire.dx * act.fire.speed, vy: act.fire.dy * act.fire.speed,
        damage: act.fire.damage * dmgMult, age: 0,
        kind: e.typeId === 'WARLOCK' ? 'bolt' : 'spit',   // render variant
      });
    }
    // CHOIR MOTHER hymn: a fan of fire-intents around the aim direction —
    // wire exactly like `fire`, one projectile each.
    if (act.fan) {
      for (const f of act.fan) {
        state.enemyShots.push({
          x: e.x, y: e.y,
          vx: f.dx * f.speed, vy: f.dy * f.speed,
          damage: f.damage * dmgMult, age: 0,
          kind: 'bolt',
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
        applyEscalation(m, state.time);
        state.enemies.push(m);
      }
      state.effects.push({ kind: 'boss_nova', x: e.x, y: e.y, radius: 20, age: 0, ttl: 0.3 });
    }
    // PYRAXIS blink: hop by (dx,dy)*dist, clamped inside the arena walls.
    if (act.teleport) {
      e.x = Math.max(-600, Math.min(600, e.x + act.teleport.dx * act.teleport.dist));
      e.y = Math.max(-600, Math.min(600, e.y + act.teleport.dy * act.teleport.dist));
      state.effects.push({ kind: 'boss_nova', x: e.x, y: e.y, radius: 14, age: 0, ttl: 0.25 });
    }
    if (Math.hypot(p.x - e.x, p.y - e.y) < 12) {
      // GRAVELMAW mid-charge hits harder (the contact-damage window).
      const chargeMult = e.charging ? 1.5 : 1;
      touchDmg = Math.max(touchDmg, 12 * dmgMult * (e.contactDamageMult || 1) * chargeMult);
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
      p.hp -= touchDmg;
      p.invuln = 0.6;
      if (p.hp <= 0) { die(); return; }
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
        p.hp -= s.damage * takenMult;
        p.invuln = 0.6;
      }
      s.age = 99;
      if (p.hp <= 0) { die(); return; }
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
      state.gems.push(makeGem(e.x, e.y, e.xp));
      // Potion drop roll (Scavenger dropBonus widens the base chance; the
      // roll lives here because skills.js's rollDrop is base-config only).
      // Alchemist's Blessing curse: dropChanceMult scales the whole chance.
      const dropChance = (C.POTIONS.DROP_CHANCE + (p.stats.dropBonus || 0)) *
        ((p.choices && p.choices.dropChanceMult) || 1);
      const drop = Math.random() < dropChance
        ? { x: e.x, y: e.y, kind: Math.random() < 0.5 ? 'hp' : 'mp' } : null;
      if (drop) state.drops.push(drop);
      if (e.boss) {
        // Boss payout: guaranteed chest pair + an up-tier item drop. The
        // wave does NOT advance here — the PORTAL opens (see below) and the
        // intermission CONTINUE starts the next wave (wave-6 progression).
        const B = C.ESCALATION.BOSS;
        for (let c = 0; c < B.CHESTS; c++) {
          maybeSpawnChest(state,
            { x: e.x + (c ? 14 : -14), y: e.y + (c ? 8 : -8), elite: true }, () => 0);
        }
        state.itemDrops.push({ x: e.x, y: e.y, item: rollItem(Math.random, C.ITEMS.BOSS_TIER_BIAS), age: 0 });
        state.wave.pendingClear = true;
        state.wave.portalX = e.x;
        state.wave.portalY = e.y;
        // WAVE-8/A: the FINAL death of the wave's cast (nobody left alive)
        // queues the portal-entry cinematic. The first of a double pair just
        // opens the portal — existing wave-6 behavior is kept.
        if (!state.wave.bosses.some(b => b !== e && b.hp > 0)) state.wave.cinePending = true;
        feedWeaponXp(30);   // boss kill = big weapon-XP payout
        toast('BOSS DOWN');
      } else {
        // Rare item drops (loot.js): elites often + up-tier, normals rarely.
        // Fortune's Favor blessing: itemDropMult scales the drop chance.
        const chance = (e.elite ? C.ITEMS.ELITE_CHANCE : C.ITEMS.DROP_CHANCE) *
          ((p.choices && p.choices.itemDropMult) || 1);
        if (Math.random() < chance) {
          state.itemDrops.push({
            x: e.x, y: e.y,
            item: rollItem(Math.random, e.elite ? 0.75 : 0), age: 0,
          });
        }
        if (e.guaranteesChest) {
          maybeSpawnChest(state, e, () => 0);
        } else {
          maybeSpawnChest(state, e);
        }
      }
      state.enemies.splice(i, 1);
      p.kills++;
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
  const chestEvents = tickChests(state, dt);
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
  for (const ev of chestEvents) {
    if (ev.kind === 'chestOpened') {
      toast('CHEST OPENED: ' + ev.rarity.toUpperCase());
      audio.playSfx('chest');
      // PALADIN bless: heal on chest open.
      const heal = state.character ? (state.character.healOnChest || 0) : 0;
      if (heal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + heal);
    } else if (ev.kind === 'gambleHorde') {
      toast('THE GAMBLE BETRAYS YOU - MINI HORDE!');
    } else if (ev.kind === 'tokenOffer') {
      // WAVE-7/A: legendary chests carry EVOLUTION TOKENS (the 1-of-N flavor
      // choice is cosmetic — all options are the same currency). A token may
      // re-open a previously declined EVOLVE offer, so clear the declines.
      state.evoTokens++;
      for (const w of state.weapons) w.evoDeclined = false;
      toast('EVOLUTION TOKEN! ' + state.evoTokens + ' HELD');
      audio.playSfx('levelup');
    }
  }

  // Effective pickup radius: base + Loot Vortex items + MAGNET arch.
  const pickR = p.stats.pickup * (p.stats.pickupMult || 1) * am.pickupMult;

  // Potion drops: auto-pickup within gem radius, but only if not at cap —
  // a full inventory leaves the potion on the ground for later.
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    if (Math.hypot(d.x - p.x, d.y - p.y) < pickR) {
      if (p.potions[d.kind] < C.POTIONS.MAX_CARRIED) {
        p.potions[d.kind]++;
        state.drops.splice(i, 1);
      }
    }
  }

  // Rare item drops (loot.js): auto-equip when a slot is free; at the 4/4 cap
  // the newcomer EXCHANGES the oldest item (WAVE-9) — heat charges inside
  // equipOrExchangeItem (+1 new slot / +0 exchange).
  for (let i = state.itemDrops.length - 1; i >= 0; i--) {
    const d = state.itemDrops[i];
    if (Math.hypot(d.x - p.x, d.y - p.y) < pickR) {
      state.itemDrops.splice(i, 1);
      equipOrExchangeItem(d.item);
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

  // Gem pickup.
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const gm = state.gems[i];
    const d = Math.hypot(gm.x - p.x, gm.y - p.y);
    if (d < pickR) {
      p.xp += gm.xp * (p.stats.xpMult || 1) * (wm.xpMult || 1);   // Scholar + SUNNY
      state.gems.splice(i, 1);
      feedWeaponXp(1);                         // gems trickle weapon XP
      while (p.xp >= p.xpNext) { levelUp(); }
    }
  }

  // Camera follows player.
  state.cam.x += ((p.x - C.VIEW_W / 2) - state.cam.x) * Math.min(1, dt * 5);
  state.cam.y += ((p.y - C.VIEW_H / 2) - state.cam.y) * Math.min(1, dt * 5);

  // EVOLVE overlay check: level-ups (gems/boss XP), item equips and tokens
  // can all complete a requirements triple since the last frame.
  maybeOpenEvolve();

  // WAVE-8/A: start the portal-entry cinematic once overlays have settled —
  // the boss-XP payout may open a draft/evolve first; those return mode to
  // 'playing' when closed, and the movie starts on the next tick.
  if (state.wave.cinePending && state.mode === 'playing') startPortalCine();
}

// ---------- Leveling & draft ----------
function levelUp() {
  const p = state.player;
  p.xp -= p.xpNext;
  p.level++;
  p.xpNext = Math.floor(p.xpNext * C.XP_LEVEL_GROWTH);
  audio.playSfx('levelup');
  state.pendingDrafts++;
  if (state.mode === 'playing') openDraft();
}

function toast(msg) {
  state.toasts.push({ msg, ttl: 3 });
  if (state.toasts.length > 3) state.toasts.shift();
}

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
      weaponCards.push({
        id: 'wpn_' + id,
        name: def.name,
        desc: 'NEW WEAPON · fills slot ' + (nonVolley + 2) + '/' + slotCap,
        apply: () => { state.weapons.push(makeWeapon(id)); },
      });
    }
  }
  // Level-up cards for every owned weapon below the cap (VOLLEY included —
  // its instance rides in state.weapons but never takes a slot).
  for (const w of state.weapons) {
    const lv = w.level || 1;
    if (lv >= WEAPON_MAX_LEVEL) continue;
    weaponCards.push({
      id: 'lvl_' + w.type + '_' + lv,
      name: WEAPON_NAMES[w.type] + ' UP',
      desc: (describeWeaponLevel(w.type, lv + 1) || '') + ' · Lv ' + lv + '/' + WEAPON_MAX_LEVEL,
      apply: () => { levelUpWeapon(w); },
    });
  }
  const pool = [
    ...weaponCards.map(c => ({ ...c, weight: 1 })),
    ...UPGRADES.map(u => ({ ...u, weight: 0.3 })),   // downweighted stats
  ];
  // Weighted draw WITHOUT replacement, take 3 (no duplicate cards per draft).
  const choices = [];
  while (choices.length < 3 && pool.length > 0) {
    let r = Math.random() * pool.reduce((s, c) => s + c.weight, 0);
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { if ((r -= pool[i].weight) < 0) { idx = i; break; } }
    choices.push(pool.splice(idx, 1)[0]);
  }
  ovTitle.textContent = 'LEVEL ' + state.player.level;
  ovSub.textContent = 'choose your build';
  ovCards.innerHTML = '';
  choices.forEach((u, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="name">${i + 1}. ${u.name}</div><div class="desc">${u.desc}</div><div class="key">[${i + 1}]</div>`;
    el.onclick = () => pick(u);
    ovCards.appendChild(el);
  });
  overlay.style.display = 'flex';
}

function pick(u) {
  u.apply(state.player);
  state.pendingDrafts--;
  if (state.pendingDrafts > 0) { openDraft(); return; }
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
  for (const w of cands) {
    const card = describeEvolution(w);
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML =
      `<div class="name">EVOLVE: ${card.name}</div>` +
      `<div class="desc">${card.desc}<br>${card.weaponName} Lv${card.levelReq} + ${card.itemKindName} + ${card.tokenCost} token</div>` +
      `<div class="key">[1]</div>`;
    el.onclick = () => {
      const res = evolveWeapon(w, equippedItemKinds(), state.evoTokens);
      if (res.ok) {
        state.evoTokens = res.tokens;
        // WAVE-9: a weapon EVOLUTION charges +2 heat (event-id deduped, so a
        // double-fired tick can never double-charge).
        addHeat(state, 'WEAPON_EVOLUTION', null, 'evo:' + w.type + ':' + res.name);
        toast(res.name.toUpperCase() + ' UNLEASHED');
        audio.playSfx('levelup');
      }
      closeEvolve();
    };
    ovCards.appendChild(el);
  }
  menuCard('NOT NOW', 'keep the token - re-offered on the next token or item', () => {
    for (const w of cands) w.evoDeclined = true;
    closeEvolve();
  });
}

function closeEvolve() {
  overlay.style.display = 'none';
  state.mode = 'playing';
}

function die() {
  const p = state.player;
  state.mode = 'dead';
  audio.stopMusic();
  audio.playSfx('death');
  // Meta payout: gold into the profile (+first-clear bonus on a new best).
  // NOTE: meta.js loadProfile() drops unknown fields (incl. our bestTime),
  // so the best-run bonus is per-session until loadProfile preserves it.
  const firstClear = state.time > (profile.bestTime || 0);
  if (firstClear) profile.bestTime = Math.floor(state.time);
  // Greed shop line + Midas items multiply the payout (computeRunGold takes
  // goldMult as a runStat). WAVE-9: RAISE THE STAKES multiplies on top —
  // goldMult tracks MANUAL pushes ONLY (built-in heat never inflates gold).
  const gold = computeRunGold({
    kills: p.kills, level: p.level, time: state.time, firstClear,
    goldMult: (p.stats.goldMult || 1) * goldMult(manualPushes(state)),
  });
  profile.gold += gold;
  saveProfile(profile);

  ovTitle.textContent = 'THE HORDE WINS';
  ovSub.innerHTML = `survived ${Math.floor(state.time)}s · level ${p.level} · ${p.kills} kills` +
    `<br>GOLD EARNED: +${gold}${firstClear ? ' (NEW BEST TIME!)' : ''} · purse: ${profile.gold}`;
  ovCards.innerHTML = '';
  menuCard('RETRY', 'straight back in [R]', () => startRun());
  menuCard('TITLE', 'spend your gold [T]', () => showTitle());
  overlay.style.display = 'flex';
}

// ---------- Meta screens: title / shop / characters / settings ----------
function menuCard(name, sub, onclick, dim) {
  const el = document.createElement('div');
  el.className = 'card' + (dim ? ' dim' : '');
  el.innerHTML = `<div class="name">${name}</div><div class="desc">${sub || ''}</div>`;
  el.onclick = () => { audio.playSfx('button'); onclick(); };
  ovCards.appendChild(el);
  return el;
}

function openMenu() {
  // Common frame for every meta screen; caller fills ovCards.
  state.mode = 'menu';
  overlay.style.display = 'flex';
  ovCards.innerHTML = '';
  ovCards.style.flexWrap = 'wrap';
  ovCards.style.justifyContent = 'center';
}

function showTitle() {
  openMenu();
  ovTitle.textContent = 'HORDES';
  ovTitle.className = 'logo';
  ovSub.innerHTML = `purse: ${profile.gold} gold · equipped: ` +
    (CHARACTERS[profile.equippedCharacter] || CHARACTERS.KNIGHT).name +
    (hasArcadePass(profile) ? ' · ARCADE PASS' : '') +
    '<br>the build IS the game';
  menuCard('PLAY', 'start a run', () => startRun());
  menuCard('SHOP', 'permanent upgrades', () => showShop());
  menuCard('CHARACTERS', 'unlock & equip', () => showCharacters());
  menuCard('SETTINGS', 'audio & reset', () => showSettings());
}

function showShop() {
  openMenu();
  ovTitle.textContent = 'SHOP';
  ovTitle.className = '';
  ovSub.textContent = `GOLD: ${profile.gold}`;
  for (const def of SHOP_UPGRADES) {
    const lvl = profile.purchased[def.id] || 0;
    const capped = lvl >= def.maxLevel;
    const cost = upgradeCost(def, lvl);
    const afford = profile.gold >= cost;
    const el = menuCard(
      def.name,
      `${def.desc}<br>LV ${lvl}/${def.maxLevel} · ${capped ? 'MAXED' : cost + ' gold'}`,
      () => {
        if (buyUpgrade(profile, def.id)) { saveProfile(profile); showShop(); }
      },
      capped || !afford,
    );
    if (capped) el.onclick = () => audio.playSfx('button');
  }
  menuCard('BACK', 'to title [ESC]', () => showTitle());
}

function showCharacters() {
  openMenu();
  ovTitle.textContent = 'CHARACTERS';
  ovTitle.className = '';
  ovSub.textContent = `GOLD: ${profile.gold}`;
  for (const ch of Object.values(CHARACTERS)) {
    const owned = profile.unlockedCharacters.includes(ch.id);
    const equipped = profile.equippedCharacter === ch.id;
    const afford = profile.gold >= ch.unlockCost;
    const sub = equipped ? 'EQUIPPED'
      : owned ? 'tap to equip'
      : `${ch.desc}<br>unlock: ${ch.unlockCost} gold`;
    const el = menuCard(
      ch.name + (equipped ? ' *' : ''),
      sub,
      () => {
        if (equipped) return;
        if (owned) {
          if (equipCharacter(profile, ch.id)) { saveProfile(profile); showCharacters(); }
        } else if (unlockCharacter(profile, ch.id)) {
          equipCharacter(profile, ch.id);   // buy -> equip in one flow
          saveProfile(profile);
          showCharacters();
        }
      },
      (!owned && !afford),
    );
    if (!owned && !afford) el.onclick = () => audio.playSfx('button');
  }
  menuCard('BACK', 'to title [ESC]', () => showTitle());
}

let resetArmed = false;
function showSettings() {
  openMenu();
  resetArmed = false;
  ovTitle.textContent = 'SETTINGS';
  ovTitle.className = '';
  ovSub.textContent = 'audio & profile';
  menuCard('MUSIC', 'currently ' + (audio.getMusicEnabled() ? 'ON' : 'OFF'), () => {
    audio.setMusicEnabled(!audio.getMusicEnabled());
    showSettings();
  });
  menuCard('SFX', 'currently ' + (audio.getSfxEnabled() ? 'ON' : 'OFF'), () => {
    audio.setSfxEnabled(!audio.getSfxEnabled());
    showSettings();
  });
  menuCard(resetArmed ? 'CONFIRM RESET?' : 'RESET PROFILE',
    resetArmed ? 'wipes gold, upgrades & unlocks' : 'tap twice to confirm',
    () => {
      if (!resetArmed) { resetArmed = true; showSettings(); return; }
      profile = makeProfile();
      saveProfile(profile);
      showSettings();
    });
  menuCard('BACK', 'to title [ESC]', () => showTitle());
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
  p.hp = p.stats.maxHp;                          // mods changed maxHp
  const pots = startPotionCount(profile);        // character base + Travel Pack
  p.potions = { hp: pots, mp: pots };
  state.baseWeaponSlots = startWeaponSlots(profile); // 3 base; 4/5/6 shop-bought
  state.weaponSlots = state.baseWeaponSlots;
  // WAVE-7 run-scoped systems reset here (fresh makePlayer already dropped
  // player.choices — these are the state-side companions):
  state.evoTokens = 0;
  state.choiceSeed = (Math.random() * 1e9) | 0;
  state.choiceRng = mulberry32(state.choiceSeed);   // deterministic per-run offers
  state.takenChoices = [];
  state.pendingChoiceOffers = null;
  state.weather = initWeather(rollWeather(), (Math.random() * 1e9) | 0);
  state.groundSeed = (Math.random() * 1e9) | 0;   // world-space decor field
  state.weapons = [];
  // VOLLEY instance rides in state.weapons so gems/bosses can feed it XP and
  // the draft can level it — but it never occupies one of WEAPON_SLOTS.
  state.weapons.push(makeWeapon('VOLLEY'));
  if (ch.startingWeapon) state.weapons.push(makeWeapon(ch.startingWeapon));
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
  state.time = 0;
  state.spawnTimer = 0;
  state.pendingDrafts = 0;
  state.wave = { num: 1, endsAt: C.ESCALATION.WAVE_LENGTH, boss: null, bosses: [], pendingClear: false, startKills: 0, cinePending: false };
  // WAVE-9: fresh heat ledger every run (run-scoped; NEVER persisted to
  // meta/profile — a null-then-init forces the reset, initHeat is idempotent
  // but does not clear a stale ledger).
  state.heat = null;
  initHeat(state);
  spawnWaveArches();
  state.cam = { x: p.x - C.VIEW_W / 2, y: p.y - C.VIEW_H / 2 };
  state.mode = 'playing';
  overlay.style.display = 'none';
  audio.startMusic();
}

// ---------- Input: shared action seam (keyboard AND touch use these) ----------
// One code path per action — the touch buttons in index.html and the keydown
// handler both funnel through runAction, so no game logic is duplicated.
// Doctrine actions only nudge the AutoPilot controller's state; no input
// handling lives in controllers.js.
function runAction(act) {
  if (state.mode !== 'playing') return;
  if (act === 'focus') controller.cycleFocus();
  else if (act === 'stance') controller.cycleStance();
  else if (act === 'q') useSkill(state, 'FROST_NOVA');
  else if (act === 'w') useSkill(state, 'OVERCHARGE');
  else if (act === 'h') {
    // Alchemy (potionPower) + choices.js potionHealMult (Alchemist's
    // Blessing / Vampire's Kiss) + BOSS CURSE all applied at the action seam
    // — skills.js usePotion stays base-config only. While a boss lives,
    // health heals are halved again.
    const p2 = state.player;
    const healMult = ((p2.choices && p2.choices.potionHealMult) || 1) * (p2.stats.potionPower || 1);
    const before = p2.hp;
    usePotion(state, 'hp');                      // base C.POTIONS.HP_HEAL
    let healed = p2.hp - before;
    if (healed > 0) {
      const bonus = Math.min(C.POTIONS.HP_HEAL * (healMult - 1),
        p2.stats.maxHp - p2.hp);
      if (bonus > 0) p2.hp += bonus;
      healed = p2.hp - before;
      if (state.wave.boss) p2.hp -= healed / 2;
    }
  }
  else if (act === 'n') {
    // Mana potion with the Alchemy (potionPower) bonus at the same seam.
    const p2 = state.player;
    const before = p2.mana;
    usePotion(state, 'mp');
    const restored = p2.mana - before;
    if (restored > 0) {
      const bonus = Math.min(C.POTIONS.MP_RESTORE * ((p2.stats.potionPower || 1) - 1),
        p2.stats.maxMana - p2.mana);
      if (bonus > 0) p2.mana += bonus;
    }
  }
}

window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (state.mode === 'intro') { endIntro(); return; }   // any key skips the movie
  if (state.mode === 'portal-cine') {                   // WAVE-8/A: any key skips
    if (C.CINE.SKIPPABLE) endPortalCine();
    return;
  }
  if (state.mode === 'draft' && ['1', '2', '3'].includes(ev.key)) {
    const card = ovCards.children[Number(ev.key) - 1];
    if (card) card.click();
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
  } else if (state.mode === 'menu' && k === 'escape') {
    showTitle();                     // every sub-menu backs out to title
  } else if (state.mode === 'playing') {
    const keyMap = {
      tab: 'focus', g: 'stance',
      [C.SKILLS.FROST_NOVA.KEY]: 'q',
      [C.SKILLS.OVERCHARGE.KEY]: 'w',
      h: 'h', n: 'n',
    };
    const act = keyMap[k];
    if (act) {
      if (k === 'tab' && ev.preventDefault) ev.preventDefault();
      runAction(act);
    }
  }
});

// ---------- Touch controls (Sk408): mirror the keyboard actions ----------
const touchLayer = document.getElementById('touch');
const touchEls = {};
for (const id of ['tc-focus', 'tc-stance', 'tc-q', 'tc-w', 'tc-h', 'tc-n']) {
  touchEls[id] = document.getElementById(id);
}

// Reveal the layer on touch devices (CSS @media (pointer: coarse) covers
// most; this catches the rest, e.g. hybrid laptops).
const hasTouch = ('ontouchstart' in window) ||
  ((typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) || 0) > 0;
if (touchLayer && hasTouch && touchLayer.classList) touchLayer.classList.add('on');

// pointerdown fires with no tap delay; touch-action: manipulation kills the
// legacy 300ms wait and double-tap zoom.
if (touchLayer && touchLayer.addEventListener) {
  touchLayer.addEventListener('pointerdown', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!btn) return;
    if (ev.preventDefault) ev.preventDefault();
    runAction(btn.dataset.act);
  });
}

// Badges mirror HUD state, written each frame (same numbers as the HUD).
// The touch layer is only relevant mid-run — menus are directly tappable.
function updateTouchHud() {
  if (touchLayer && touchLayer.style) {
    const want = state.mode === 'playing' ? '' : 'none';
    if (touchLayer.style.display !== want) touchLayer.style.display = want;
  }
  const p = state.player;
  const set = (id, v) => { const el = touchEls[id]; if (el) el.textContent = v; };
  set('tc-focus', controller.focus);
  set('tc-stance', controller.stance);
  const skill = (id, defId) => {
    const cd = p.skillCd[defId];
    set(id, cd > 0 ? cd.toFixed(1) + 's' : (p.mana >= C.SKILLS[defId].MANA ? 'RDY' : 'LOW'));
  };
  skill('tc-q', 'FROST_NOVA');
  skill('tc-w', 'OVERCHARGE');
  set('tc-h', String(p.potions.hp));
  set('tc-n', String(p.potions.mp));
}

// ---------- HUD ----------
function drawHud() {
  const p = state.player;
  // ARCADE PASS: golden HUD (the 60k gold flex).
  if (hud.style) {
    const want = hasArcadePass(profile) ? '#ffd75e' : '';
    if (hud.style.color !== want) hud.style.color = want;
  }
  const bars = 20;
  const filled = Math.max(0, Math.min(bars, Math.round(bars * p.hp / p.stats.maxHp)));
  const mFilled = Math.max(0, Math.min(bars, Math.round(bars * p.mana / p.stats.maxMana)));
  const skillTxt = (id, label) => {
    const cd = p.skillCd[id];
    const def = C.SKILLS[id];
    if (cd > 0) return `${label} ${cd.toFixed(1)}s`;
    return p.mana >= def.MANA ? `${label} RDY` : `${label} --`;
  };
  // Wave timer line: countdown to the boss, BOSS! (+ NAMES, wave-7/B) while
  // any lives, or PORTAL! while the wave-clear portal is open.
  const waveLeft = Math.max(0, state.wave.endsAt - state.time);
  const bossNames = (state.wave.bosses || []).filter(b => b.hp > 0).map(b => b.name).join(' & ');
  const waveTxt = state.wave.boss ? 'BOSS! ' + (bossNames || '') : state.portal ? 'PORTAL!'
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
  hud.textContent =
    `HP  [${'#'.repeat(filled)}${'-'.repeat(bars - filled)}] ${Math.ceil(p.hp)}/${p.stats.maxHp}\n` +
    `MAN [${'#'.repeat(mFilled)}${'-'.repeat(bars - mFilled)}] ${Math.floor(p.mana)}/${p.stats.maxMana}\n` +
    `Q ${skillTxt('FROST_NOVA', 'FrostNova')}   W ${skillTxt('OVERCHARGE', 'Ovrchg')}${p.buffs.overcharge > 0 ? '!' : ''}\n` +
    `POTIONS  H:${p.potions.hp}  N:${p.potions.mp}   TAB Focus:${controller.focus} G:${controller.stance}\n` +
    `WPN ${1 + nonVolley}/${slotCap} ${wpnNames}\n` +
    `ITM ${state.items.length}/${MAX_EQUIPPED} ${itemNames}` +
    (state.evoTokens > 0 ? ` \u2666${state.evoTokens}` : '') + '\n' +
    `FOES ${foeLine()}\n` +
    `WEATHER: ${state.weather ? state.weather.def.name.toUpperCase() : 'CLEAR'}` +
    `   ${describeHeat(heatOf(state))}` +
    (archBits.length ? `   ARCH ${archBits.join(' ')}` : '') + '\n' +
    `WAVE ${state.wave.num} - ${waveTxt}   LVL ${p.level}   XP ${Math.floor(p.xp)}/${p.xpNext}\n` +
    `TIME ${Math.floor(state.time)}s   KILLS ${p.kills}   POS ${p.x.toFixed(1)},${p.y.toFixed(1)}` +
    (state.toasts.length ? `\n! ${state.toasts[state.toasts.length - 1].msg}` : '');
}

// Per-type enemy census (HUD probe; smoke test asserts on it).
// W=Warlock T=Tick X=Colossus E=elite count.
function foeLine() {
  const n = { C: 0, S: 0, B: 0, P: 0, D: 0, W: 0, T: 0, X: 0, E: 0 };
  const k = { CHASER: 'C', SWARMER: 'S', BRUTE: 'B', SPITTER: 'P', DASHER: 'D',
              WARLOCK: 'W', TICK: 'T', COLOSSUS: 'X' };
  for (const e of state.enemies) {
    n[k[e.typeId] || 'C']++;
    if (e.elite) n.E++;
  }
  return `C:${n.C} S:${n.S} B:${n.B} P:${n.P} D:${n.D} W:${n.W} T:${n.T} X:${n.X} E:${n.E}`;
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
  showTitle();
}
// Click/tap skip (guarded: headless stubs may not implement addEventListener).
// WAVE-8/A: the same gesture skips the portal cinematic.
if (canvas.addEventListener) canvas.addEventListener('pointerdown', () => {
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
  openIntermission();
}

state.mode = 'intro';
let last = performance.now();
let lastIntroPhase = null;
function frame(now) {
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
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.mode === 'playing') update(dt);
  renderer.render(state, state.cam);
  drawHud();
  updateTouchHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Headless test seam (smoke.mjs): live state access so integration probes
// can force conditions (Lv8 + item + token) through the REAL loop. Never
// read by the browser page.
export const __TEST = { state, controller, startRun };
