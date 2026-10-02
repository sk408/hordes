// HORDES progression simulator — ENGINE (worker-process side).
//
// Drives the REAL game (src/main.js through test/_harness.mjs) headlessly:
// real frame loop, real AUTO pilot, real draft activation, real gold
// settlement, real shop buy functions. Nothing in the tree is edited.
//
// SIM BUDGET: the repo's 60-sim-second arm cap (test/_sim_budget.mjs) makes a
// career simulation impossible, so THIS PROCESS ONLY installs a registry whose
// arms are never "measured" and whose budget cannot be declared, BEFORE the
// harness is imported. The cap is untouched for the suite and every other
// tool; import this module only from tools/progression_sim.mjs workers.
import { treeUrl, loadCatalogue, requireRule, SimConfigError } from './catalogue.mjs';
import { makeShopper, buyAll, estimateIncome } from './policies.mjs';

const arms = [];
const push = arms.push.bind(arms);
arms.push = (a) => { a.measured = false; return push(a); };
globalThis.__HORDES_SIM_REGISTRY = { totalS: 0, arms, get budgetS() { return null; }, set budgetS(_v) {} };

const H = await import(treeUrl('test/_harness.mjs'));
const CFG = (await import(treeUrl('src/config.js'))).CONFIG;
const EVOLUTION_DEFS = (await import(treeUrl('src/evolutions.js'))).EVOLUTION_DEFS || {};

export const DRAFT_POLICIES = ['random', 'weapons-first', 'evolution-first', 'stats-first'];
export const ONCE_MODES = ['asis', 'take', 'never'];
export const LOADOUT_POLICIES = ['default', 'all-owned'];
// stats-first draft priority (base stat-card ids). Cards not listed are taken
// only as a random fallback.
export const DEFAULT_STAT_PRIORITY = ['multi', 'rate', 'dmg', 'pierce', 'hp', 'speed', 'pickup'];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One seed per (career seed, run index); identical across policies, so every
// policy faces the same random stream at the same run index.
export const runSeed = (seed, i) => (Math.imul(seed | 0, 0x9E3779B1) ^ Math.imul(i | 0, 0x85EBCA6B)) | 0;

const realRandom = Math.random;
const realDateNow = Date.now;

const DRAFT_TIMEOUT_S = Number(CFG.AUTOPILOT && CFG.AUTOPILOT.DRAFT_TIMEOUT) || 0;
export const draftTimeoutS = () => DRAFT_TIMEOUT_S;

function stanceNames() {
  return Object.keys((CFG.AUTOPILOT && CFG.AUTOPILOT.STANCES) || {});
}

export async function validatePolicy(pol, cat) {
  if (!DRAFT_POLICIES.includes(pol.draft)) throw new SimConfigError(`unknown draft policy '${pol.draft}'. Choose one of: ${DRAFT_POLICIES.join(', ')}`);
  if (!ONCE_MODES.includes(pol.once)) throw new SimConfigError(`unknown --once '${pol.once}'. Choose one of: ${ONCE_MODES.join(', ')}`);
  if (!LOADOUT_POLICIES.includes(pol.loadout)) throw new SimConfigError(`unknown loadout policy '${pol.loadout}'. Choose one of: ${LOADOUT_POLICIES.join(', ')}`);
  const st = stanceNames();
  if (!st.includes(pol.stance)) throw new SimConfigError(`stance '${pol.stance}' is not in CONFIG.AUTOPILOT.STANCES (have: ${st.join(', ') || 'none'})`);
  cat.requireCharacter(pol.character);
  makeShopper(pol.shop, cat, pol);             // throws on unknown policy / missing rows
  if (pol.once !== 'asis') await requireRule(pol.onceRule || 'once');
}

let bootN = 0;
async function bootGame() {
  const h = await H.boot({ variant: 'psim-' + process.pid + '-' + (bootN++) });
  for (const k of ['state', 'startRun', 'getProfile', 'pilotPrefs', 'purse']) {
    if (h.T[k] === undefined) throw new SimConfigError(`src/main.js __TEST seam lost '${k}'; tools/progression/engine.mjs needs updating`);
  }
  CFG.AUTOPILOT.DRAFT_TIMEOUT = 1e9;   // the policy picks; the game's timer never fires
  return h;
}

function applyCharacter(prof, cat, id) {
  if (prof.equippedCharacter === id) return;
  // Granted, not bought: the character is an independent variable, so its
  // unlock price is kept out of the career's economy.
  if (!cat.META.grantCharacter(prof, id) || !cat.META.equipCharacter(prof, id)) {
    throw new SimConfigError(`could not grant/equip character '${id}'`);
  }
}

function applyLoadout(h, prof, cat, policy) {
  if (policy !== 'all-owned') return;          // 'default': whatever the game equipped
  const L = h.T.loadout;
  const owned = L && L.choices ? L.choices() : (prof.unlockedWeapons || []).filter((w) => w !== 'VOLLEY');
  const cap = Math.max(0, L && L.slotCap ? L.slotCap() : cat.META.startWeaponSlots(prof) - 1);
  const price = (w) => cat.META.WEAPON_PRICES[w] || 0;
  const pickd = owned.map((w, i) => ({ w, i })).sort((a, b) => price(b.w) - price(a.w) || a.i - b.i).slice(0, cap).map((x) => x.w);
  prof.loadout = pickd.length ? pickd : null;
}

function causeOf(d) {
  if (!d) return '-';
  if (d.midBoss) return 'HERALD';
  if (d.bossId) return 'BOSS:' + d.bossId;
  return (d.cause || 'contact') + ':' + (d.typeId || d.name || '?');
}

// Play ONE run to death / win / cap through the real loop.
export function playRun(h, pol, { seed, capS, speed, onceId, statPriority, traceEvery = 0 }) {
  const T = h.T, st = T.state, prof = T.getProfile();
  Math.random = mulberry32(seed);
  const prng = mulberry32(seed ^ 0x51ed);
  let frames = 0;
  // The escape corridor seeds itself from the wall clock; pin it per run.
  Date.now = () => 1700000000000 + (seed >>> 0) % 1000003 * 1000 + frames * 16;
  try {
    T.pilotPrefs.storage.setItem(T.pilotPrefs.KEY_STANCE, pol.stance);
    T.pilotPrefs.applyStance();
    const goldBefore = prof.gold;
    T.startRun();
    if (T.setPilotMode) T.setPilotMode('AUTO_ALL');
    const weapons = st.weapons.map((w) => w.type).join('+');
    let drafts = 0, end = null, maxWave = 1, escFrames = 0, stuck = 0, lastT = -1, tookOnce = null;
    let firstEvo = null, evolved = 0;   // sim seconds of the first evolution; evolutions in the run
    const picks = { weapon: 0, stat: 0, once: 0, other: 0 };
    const trace = []; let nextTrace = traceEvery;
    const isRule = (o) => !!o.rule || String(o.id).startsWith('rule_');
    const isWeapon = (o) => /^(lvl|wpn)_/.test(String(o.id));
    while (true) {
      if (st.mode === 'playing' || st.mode === 'finale') st.gameSpeed = speed;
      const cards0 = h.elements['ov-cards'] ? h.elements['ov-cards'].children : [];
      if (st.mode === 'draft' && cards0.length && cards0[0]._draftOffer) {
        const offs = cards0.map((c) => c._draftOffer);
        let pick = null;
        const onceIdx = offs.findIndex((o) => o.id === onceId);
        if (pol.once === 'take' && onceIdx >= 0) pick = onceIdx;
        else {
          let cand = offs.map((_o, i) => i);
          if (pol.once === 'never') cand = cand.filter((i) => offs[i].id !== onceId);
          if (pol.draft !== 'random') cand = cand.filter((i) => !isRule(offs[i]));
          if (!cand.length) cand = offs.map((_o, i) => i);
          if (pol.draft === 'weapons-first') { const w = cand.find((i) => isWeapon(offs[i])); if (w !== undefined) pick = w; }
          if (pol.draft === 'evolution-first') pick = evolutionFirstPick(st, offs, cand, statPriority);
          if (pol.draft === 'stats-first') {
            let best = null, bestR = Infinity;
            for (const i of cand) { const r = statPriority.indexOf(offs[i].id); if (r >= 0 && r < bestR) { best = i; bestR = r; } }
            if (best === null) { const o = cand.find((i) => !isWeapon(offs[i]) && !isRule(offs[i])); if (o !== undefined) best = o; }
            if (best !== null) pick = best;
          }
          if (pick === null) pick = cand[Math.floor(prng() * cand.length)];
        }
        const o = offs[pick]; drafts++;
        const cls = o.id === onceId ? 'once' : isWeapon(o) ? 'weapon' : statPriority.includes(o.id) ? 'stat' : 'other';
        picks[cls]++;
        if (o.id === onceId) tookOnce = Math.round(st.time);
        cards0[pick].click();
      }
      h.pump(1); frames++;
      maxWave = Math.max(maxWave, st.wave.num);
      if (st.weapons.length && st.weapons.some((w) => w.evolutionId)) {
        const n = st.weapons.filter((w) => w.evolutionId).length;
        if (n > evolved) { evolved = n; if (firstEvo === null) firstEvo = Math.round(st.time); }
      }
      if (traceEvery && st.time >= nextTrace) {
        nextTrace += traceEvery;
        const pl = st.player;
        trace.push({ t: Math.round(st.time), level: pl.level, drafts, kills: pl.kills, hp: Math.round(pl.hp), maxHp: Math.round(pl.stats.maxHp),
          dmg: Math.round(pl.stats.damage), enemies: st.enemies.length, purse: T.purse.get(), wave: st.wave.num,
          tiers: { ...st.runCounts.gold.kills }, survival: st.runCounts.gold.survival || 0,
          near: st.enemies.filter((e) => Math.hypot(e.x - pl.x, e.y - pl.y) < 40).map((e) => (e.boss ? (e.midBoss ? 'HERALD' : 'BOSS') : e.typeId)).sort().join(',') });
      }
      if (st.mode === 'dead') { end = 'died'; break; }
      if (st.runWon) { end = 'won'; break; }
      if (st.time >= capS) { end = 'capped'; break; }
      if (st.mode === 'escape') {
        escFrames++;
        if (escFrames > 60 * 240) { try { T.escape.skip(); } catch { /* seam optional */ } escFrames = 0; }
        continue;
      }
      if (st.time === lastT) stuck++; else { stuck = 0; lastT = st.time; }
      if (stuck > 60 * 60) { end = 'stuck:' + st.mode; break; }
      if (st.mode === 'chest') { h.key('keydown', { key: 'Enter' }); continue; }
      const ov = h.elements['overlay'];
      const cards = h.elements['ov-cards'] ? h.elements['ov-cards'].children : [];
      if (ov && ov.style.display === 'flex' && cards.length > 0) {
        if (st.mode === 'evolve') h.key('keydown', { key: '1' });
        else if (st.mode !== 'draft' && st.mode !== 'playing') {
          const cont = cards.find((c) => (c.innerHTML || '').includes('CONTINUE'));
          if (cont) cont.click();
        }
      }
    }
    if (end !== 'died') { try { T.purse.settle(); } catch { /* already settled */ } }
    const s = st.runSettled || {};
    return {
      end, t: Math.round(st.time * 10) / 10, wave: maxWave, level: st.player.level, drafts, kills: st.player.kills,
      gold: prof.gold - goldBefore, award: s.award ?? null, purse: s.purseBanked ?? null, winBonus: s.winBonus ?? null,
      firstClear: !!s.firstClear, cause: end === 'died' ? causeOf(st.deathBy) : end,
      weapons, picks, tookOnce, frames, firstEvo, evolved, ...(traceEvery ? { trace } : {}),
    };
  } finally {
    Math.random = realRandom;
    Date.now = realDateNow;
  }
}

// evolution-first: level the un-evolved weapon closest to its evolution (the
// highest-level one; ties by kit order), take its partner card once it is on
// the way, then any other weapon card, then a stat card (in --stat-priority
// order, then any other non-rule card).
function evolutionFirstPick(st, offs, cand, statPriority) {
  const idOf = (o) => String(o.id);
  const taken = (st.player && st.player.takenStats) || {};
  const kit = (st.weapons || []).filter((w) => !w.evolutionId && EVOLUTION_DEFS[w.type])
    .sort((a, b) => (b.level || 1) - (a.level || 1));
  for (const w of kit) {
    const lv = cand.find((i) => idOf(offs[i]).startsWith('lvl_' + w.type + '_'));
    if (lv !== undefined) return lv;
    const partner = EVOLUTION_DEFS[w.type].partner;
    if (partner && !taken[partner]) {
      const pc = cand.find((i) => idOf(offs[i]) === partner);
      if (pc !== undefined) return pc;
    }
  }
  const anyW = cand.find((i) => /^(lvl|wpn)_/.test(idOf(offs[i])));
  if (anyW !== undefined) return anyW;
  let best = null, bestR = Infinity;
  for (const i of cand) { const r = statPriority.indexOf(idOf(offs[i])); if (r >= 0 && r < bestR) { best = i; bestR = r; } }
  if (best !== null) return best;
  const stat = cand.find((i) => !/^(lvl|wpn|rule)_/.test(idOf(offs[i])) && !offs[i].rule);
  return stat === undefined ? null : stat;
}

const tag = (pol) => [pol.shop, pol.loadout, pol.draft, pol.once, pol.stance, pol.character].join('/');
export const policyKey = tag;

async function setup(job) {
  const cat = await loadCatalogue();
  await validatePolicy(job.policy, cat);
  const onceId = 'rule_' + (job.policy.onceRule || 'once');
  const h = await bootGame();
  const prof = h.T.getProfile();
  applyCharacter(prof, cat, job.policy.character);
  const runOpts = (seed) => ({ seed, capS: job.maxRunSeconds, speed: job.speed, onceId, traceEvery: job.traceEvery || 0,
    statPriority: job.policy.statPriority || DEFAULT_STAT_PRIORITY });
  return { cat, h, prof, runOpts };
}

// CAREER: fresh profile -> run -> real settlement -> shop policy -> next run.
export async function runCareer(job, emit) {
  const { cat, h, prof, runOpts } = await setup(job);
  const shopper = makeShopper(job.policy.shop, cat, job.policy);
  const fallbackIncome = Number(cat.META.RUN_GOLD && cat.META.RUN_GOLD.AWARD) || 0;
  const income = [];
  let cumSpent = 0, cumGold = 0, playS = 0;
  for (let i = 1; i <= job.runs; i++) {
    applyLoadout(h, prof, cat, job.policy.loadout);
    const r = playRun(h, job.policy, runOpts(runSeed(job.seed, i)));
    const bank = prof.gold;
    income.push(r.gold);
    const bought = buyAll(prof, shopper, estimateIncome(income, fallbackIncome), cat);
    const spent = bought.reduce((a, b) => a + b.cost, 0);
    cumSpent += spent; cumGold += r.gold;
    playS += r.t + r.drafts * DRAFT_TIMEOUT_S + job.overheadSeconds;
    const rem = cat.remaining(prof);
    emit({
      kind: 'run', policy: tag(job.policy), seed: job.seed, run: i, ...r,
      bank, bought, spent, cumSpent, cumGold, left: prof.gold,
      catPct: cat.totalCost ? +(100 * (1 - rem.cost / cat.totalCost)).toFixed(3) : 100,
      itemsPct: cat.totalItems ? +(100 * (1 - rem.items / cat.totalItems)).toFixed(3) : 100,
      playHours: +(playS / 3600).toFixed(4),
    });
  }
}

// FIXED BUILD: grant X gold, spend it with the policy (no saving up), then one
// independent run. The parent launches one of these per (budget, run index).
export async function runFixed(job, emit) {
  const { cat, h, prof, runOpts } = await setup(job);
  const shopper = makeShopper(job.policy.shop, cat, { ...job.policy, hold: false });
  prof.gold = job.budget;
  const bought = buyAll(prof, shopper, 0, cat);
  const spent = job.budget - prof.gold;
  prof.gold = 0;
  const catPct = cat.totalCost ? +(100 * (1 - cat.remaining(prof).cost / cat.totalCost)).toFixed(3) : 100;
  prof.bestTime = 1e9;                         // steady-state income: no FIRST_CLEAR bonus
  applyLoadout(h, prof, cat, job.policy.loadout);
  const r = playRun(h, job.policy, runOpts(runSeed(job.seed, 1)));
  emit({
    kind: 'fixed', policy: tag(job.policy), budget: job.budget, seed: job.seed, ...r,
    spent, buys: bought.length, catPct,
    build: bought.reduce((m, b) => { m[b.id] = (m[b.id] || 0) + 1; return m; }, {}),
  });
}
