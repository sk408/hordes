// HORDES — shared headless REAL-LOOP harness (SURVIVAL-GAP wave).
//
// One place that knows how to boot src/main.js with the DOM shims the frame
// loop touches, build the three PROGRESSION-STAGE profiles through the REAL
// meta.js API, and run whole cohorts — so the analytic sims (balance_sim,
// draft_sim) can VALIDATE their models against the actual game loop instead of
// against each other. boss_sim.mjs keeps its own copy of the shim (it grew up
// before this module existed and is not worth a risky refactor), but the
// profile definitions below are the SAME three the brief quotes cohorts for.
//
// Contract:
//   await bootReal()                     -> { state, startRun, profile }
//   await runRealCohort('maxed', 8)      -> [{ time, wave, cause, killer,
//                                             kills, level, gold, won }, ...]
//
// NOTE: importing this module is SIDE-EFFECT FREE until bootReal() is called
// (the shims are installed inside it, immediately before main.js is imported),
// so the sims can import this file from a pure context (test_meta imports
// balance_sim) without a DOM.
import { CONFIG as CFG } from '../src/config.js';
import { makeProfile, buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';
import { TOUR_KEYS } from '../src/tour.js';

// ---- the three progression stages ------------------------------------------
// PARTIAL mirrors boss_sim.mjs's --profile partial verbatim (~2.2kg spent:
// Forged Edge 2, Vitality 3, and four weapon unlocks), so the stage tables in
// every tool describe the same three saves.
export function stageProfile(name) {
  const prof = makeProfile();
  if (name === 'partial') {
    prof.gold = 0;
    prof.purchased = { dmg: 2, hp: 3 };
    prof.unlockedWeapons = ['VOLLEY', 'BOOMERANG', 'ORBIT', 'ZAP'];
    prof.unlockedCharacters = ['KNIGHT'];
    prof.equippedCharacter = 'KNIGHT';
    prof.unlockedElites = [];
    return prof;
  }
  if (name === 'maxed') {
    prof.gold = 10_000_000;
    for (const def of SHOP_UPGRADES) {
      for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
    }
    return prof;
  }
  return prof;   // 'fresh' — makeProfile()
}

export const STAGES = ['fresh', 'partial', 'maxed'];

// ---- DOM shims (smoke.mjs / boss_sim.mjs pattern) ---------------------------
const noop = () => {};
function installDom(profile) {
  const fakeCtx = new Proxy({}, {
    get(t, prop) {
      if (prop === 'fillStyle' || prop === 'globalAlpha') return undefined;
      return typeof prop === 'string' ? noop : undefined;
    },
    set() { return true; },
  });
  const fakeEl = () => {
    const el = {
      textContent: '', style: {}, children: [], onclick: null,
      click() { if (this.onclick) this.onclick(); },
      addEventListener() {},
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this._html ?? ''; },
      set(v) { this._html = v; if (v === '') el.children.length = 0; },
    });
    el.appendChild = (child) => { el.children.push(child); };
    return el;
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeCtx, createElement: () => fakeEl() };
  const elements = {};
  globalThis.document = {
    getElementById: (id) => elements[id] ?? (elements[id] =
      id === 'game' ? { ...fakeCanvas, getContext: () => fakeCtx } : fakeEl()),
    createElement: () => fakeEl(),
  };
  let keyHandler = null;
  globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; } };
  let now = 0;
  globalThis.performance = { now: () => now };
  const rafQueue = [];
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.location = { reload: noop };
  const ls = new Map([['hordes_onboarded', '1']]);
  for (const k of Object.values(TOUR_KEYS)) ls.set(k, '1');   // no coachmark pauses
  ls.set('hordes_profile_v1', JSON.stringify(profile));
  globalThis.localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
  };
  return { elements, rafQueue, keyHandler: () => keyHandler, advance: (ms) => { now += ms; } };
}

/**
 * Boot the real loop with `stage`'s save. Returns the live state handle.
 * Dynamic import so this module stays import-safe without a DOM.
 */
export async function bootReal(stage = 'fresh') {
  const dom = installDom(stageProfile(stage));
  const mainMod = await import('../src/main.js');
  const T = mainMod.__TEST;
  return {
    state: T.state,
    startRun: () => T.startRun(),
    profile: () => T.getProfile(),
    dom,
  };
}

const dtMs = 1000 / 60;

function classify(d) {
  if (!d) return 'unknown';
  if (d.midBoss) return 'HERALD';
  if (d.bossId) return 'ENDBOSS:' + d.bossId;
  if (d.typeId === 'PILLAR') return 'PILLAR';
  if (d.cause === 'shot') return 'shot:' + d.typeId;
  if (d.cause === 'drain') return 'drain';
  return 'contact:' + d.typeId;
}

/**
 * Run `runs` real frames-loop runs on `stage`'s save. Income per run is the
 * REAL settled payout: the profile gold delta across the run (settleRunGold
 * writes it), so it includes the greed multiplier, the completion bonus and
 * the chest/heat terms exactly as the game pays them.
 *
 * onRun(record, i) — optional progress callback.
 */
export async function runRealCohort(stage, runs, {
  maxSeconds = CFG.RUN.LIMIT + 60, onRun = null,
} = {}) {
  const h = await bootReal(stage);
  const st = h.state;
  const out = [];
  for (let r = 1; r <= runs; r++) {
    const goldBefore = h.profile().gold;
    h.startRun();
    let ended = null;
    const capFrames = Math.floor(maxSeconds * 60);
    for (let i = 0; i < capFrames; i++) {
      h.dom.advance(dtMs);
      const cb = h.dom.rafQueue.shift();
      if (!cb) throw new Error('real_loop: raf queue died');
      cb(performance.now());
      if (st.mode === 'dead') { ended = st.deathBy; break; }
      // Overlay auto-play (the smoke.mjs policy): draft/evolve picks a new
      // weapon when offered else card 1; intermissions CONTINUE.
      const ov = h.dom.elements['overlay'];
      const cards = h.dom.elements['ov-cards'] ? h.dom.elements['ov-cards'].children : [];
      const key = h.dom.keyHandler();
      if (ov && ov.style.display === 'flex' && cards.length > 0 && key) {
        if (st.mode === 'draft' || st.mode === 'evolve') {
          let k = '1';
          for (const c of cards) {
            if ((c.innerHTML || '').includes('NEW WEAPON')) { k = String(cards.indexOf(c) + 1); break; }
          }
          key({ key: k });
        } else {
          const titled = (t) => cards.find(c => (c.innerHTML || '').includes(t));
          const cont = titled('CONTINUE');
          if (cont) cont.click();
          else { const play = titled('PLAY'); if (play) play.click(); else key({ key: '1' }); }
        }
      }
      // SKILL POLICY (Sk408: "sims should use q and e against bosses"). The
      // overlay policy above only ever picks cards, so a cohort run never cast a
      // skill: every boss fight was fought with the skill layer dormant and mana
      // could never be spent, which made any skill or mana measurement a
      // measurement of nothing. Press both skill keys while a boss is up —
      // useSkill gates on cooldown AND mana, so this fires each skill the instant
      // it is ready and affordable, which is what a player does in a boss fight.
      //
      // `e` (not `w`) is the overcharge key here: main.js maps `e` to the act in
      // BOTH pilot modes, while `w` is held "up" in MANUAL, so pressing `w` would
      // drag the player north in a manual cohort.
      //
      // Measured effect on the FRESH stage (6 runs/arm, same seed, 300s cap):
      // dormant mean 204.8s / 3583 kills / level 26  ->  casting mean 277.8s /
      // 5993 kills / level 35. The casting arm is censored MORE at the cap, so
      // that is a floor. Every balance number this file previously fed was
      // therefore measured against a player who never used their abilities.
      if (key && (st.mode === 'playing' || st.mode === 'finale')) {
        const bossUp = (st.wave.bosses || []).some(b => b && b.hp > 0)
          || (st.wave.midBosses || []).some(b => b && b.hp > 0)
          || !!(st.finalBoss && st.finalBoss.hp > 0);
        if (bossUp) { key({ key: 'q' }); key({ key: 'e' }); }
      }
    }
    const gold = h.profile().gold - goldBefore;
    const rec = st.runWon
      ? { time: CFG.RUN.LIMIT, wave: st.wave.num, cause: 'RUN SURVIVED', killer: '-', won: true }
      : ended
        ? { time: Math.floor(ended.time ?? st.time), wave: ended.wave ?? st.wave.num,
            cause: classify(ended), killer: ended.name || ended.typeId || '?', won: false }
        : { time: Math.floor(st.time), wave: st.wave.num, cause: 'TRUNCATED', killer: '-', won: false };
    rec.kills = st.player.kills;
    rec.level = st.player.level;
    rec.gold = gold;
    rec.hp = Math.round(st.player.stats.maxHp);
    out.push(rec);
    if (onRun) onRun(rec, r);
  }
  return out;
}

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const median = (a) => {
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
