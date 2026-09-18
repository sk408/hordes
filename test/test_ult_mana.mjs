// OWNER DIRECTIVE 2026-09-17: "player ults must cost a significant amount of
// mana." The N1 slice-3 design exempted ults from the pool (a def with KILLS
// and no MANA key never entered the mana-price path — skills.js useSkill).
// That exemption is overturned here: every ult carries MANA 60 (60% of the
// 100 base pool), charged AND paid. At base regen 0.5/s the refund time from
// an empty pool is 120s — exactly one ult per 120s wave with NO potions, and
// the opening pool (100) affords the first cast immediately.
//
// One lever: nothing else rebalances. Potions, the Q/W skills, character
// stats and the economy are untouched; the guards below pin the lever so a
// future regen buff cannot silently make ults free again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- the shared headless harness (test_onboarding Part-B pattern) -----------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const domHandlers = new WeakMap();
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
    _html: '', _text: '',
    addEventListener(ev, cb) { const h = domHandlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); domHandlers.set(el, h); },
    removeEventListener(ev, cb) { const h = domHandlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((domHandlers.get(el) || {})[ev] || []).slice()) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    // v9 WHAT'S NEW: the paper note PREPENDS through insertBefore (main.js
    // addWhatsNewCard) — same shape as test_whatsnew.mjs's stub.
    insertBefore(c, ref) {
      const i = ref ? el.children.indexOf(ref) : -1;
      if (i < 0) el.children.push(c); else el.children.splice(i, 0, c);
      c.parentNode = el; return c;
    },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); } el.parentNode = null; },
    getBoundingClientRect() { return { left: 10, top: 10, right: 90, bottom: 60, width: 80, height: 50 }; },
    getContext: () => fakeCtx,
    click() { if (el.onclick) el.onclick(); el.fire('click'); },
    width: 0, height: 0,
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); } });
  Object.defineProperty(el, 'textContent', { get() { return el._text; }, set(v) { el._text = String(v); } });
  return el;
};
const elements = {};
const docKeydowns = [];
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = mk()),
  createElement: () => mk(),
  body: mk(),
  addEventListener(ev, cb) { if (ev === 'keydown') docKeydowns.push(cb); },
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; }, innerWidth: 480, innerHeight: 300 };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
const ls = new Map([['hordes_onboarded', '1'],
  // FIRST-RUN PROLOGUE neutralization (the _harness.mjs convention,
  // 2026-09-18): without this stamp the cast runs are run #1 of a fresh
  // profile — the prologue's all-buttons-disabled lockout would swallow the
  // very ult cast whose mana spend this file pins.
  ['hordes_profile_v1', JSON.stringify({ version: 8, achievements: { totals: { runs: 1 } } })]]);
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
const { CONFIG } = await import('../src/config.js');
const { useSkill, ultCharge } = await import('../src/skills.js');
const frame = () => { now += 1000 / 60; const cb = rafQueue.shift(); if (!cb) throw new Error('raf died'); cb(now); };
const tick = (s) => { for (let i = 0, n = Math.round(s * 60); i < n; i++) frame(); };
const docKey = (key) => { for (const cb of docKeydowns.slice()) cb({ key, preventDefault: noop }); };
const ULTS = ['EARTHSHATTER', 'AFTERIMAGE', 'CONSECRATION'];
const ULT_COST = 60;

// ---- the lever itself ----------------------------------------------------------
{
  for (const id of ULTS) {
    const def = CONFIG.SKILLS[id];
    ok('every ult carries a mana cost of 60 (60% of the 100 pool)',
      def.MANA === ULT_COST, { id, mana: def.MANA });
  }
  // Time-to-refund at BASE regen, from an empty pool, no potions:
  // 60 / 0.5 = 120s — exactly one per 120s wave.
  for (const id of ULTS) {
    const def = CONFIG.SKILLS[id];
    ok(id + ': refund time from empty at base regen is a full wave (120s)',
      Math.abs(def.MANA / CONFIG.MANA.REGEN - 120) < 1e-9,
      def.MANA / CONFIG.MANA.REGEN);
  }
  // REGRESSION GUARD: the cost is a large fraction of the pool and base
  // regen cannot afford TWO per wave — a future regen buff that breaks
  // either fails here before it ships.
  for (const id of ULTS) {
    const def = CONFIG.SKILLS[id];
    ok(id + ': REGRESSION GUARD — cost >= half the base pool',
      def.MANA >= 0.5 * CONFIG.MANA.MAX);
    ok(id + ': REGRESSION GUARD — base regen affords under 2 ults per wave',
      CONFIG.MANA.REGEN * 120 < 2 * def.MANA);
  }
  // Usability with potions available: the OPENING pool affords the first
  // cast, and regen + one mana potion (40) affords at least one per wave.
  ok('the opening pool (100) affords the first ult immediately',
    CONFIG.MANA.MAX >= ULT_COST);
  ok('with potions: regen (60/wave) + one potion (40) affords an ult per wave',
    CONFIG.MANA.REGEN * 120 + CONFIG.POTIONS.MP_RESTORE >= ULT_COST);
}

// ---- the cast path, refused and paid --------------------------------------------
{
  keyHandler({ key: 'x', preventDefault() {} });   // skip the intro movie
  tick(1);
  T.startRun();
  T.setPilotMode('MANUAL');                        // no AUTO_CAST/AUTO_DRINK
  st.character = { skill: 'EARTHSHATTER' };        // the KNIGHT ult on Q
  const p = st.player;
  p.stats.manaCostMult = 1;                        // no discounts: exact math
  delete p.skills;                                 // no Focus perk

  // Charge the ult fully, clear the cooldown, starve the pool.
  p.kills = 40; p.skillCd = {}; p.mana = 0;
  let u = ultCharge(st, 'EARTHSHATTER');
  ok('the charge is full and the cooldown clear', u.charge === 40 && u.cooldown === 0, u);
  ok('the charge readout carries the mana cost (60)', u.manaCost === ULT_COST, u);
  ok('ultCharge.ready is FALSE when the pool cannot afford it',
    u.ready === false && u.mana < u.manaCost, u);

  // CAST REFUSED: the real keyboard path (the game's key handler lives on
  // window), mana short.
  const manaBefore = p.mana;
  keyHandler({ key: 'q', preventDefault: noop });
  ok('refused cast spends NOTHING (no partial spend)', p.mana === manaBefore, p.mana);
  ok('refused cast banks NO charge', !(p.ultSpent && p.ultSpent.EARTHSHATTER), p.ultSpent);
  ok('refused cast rolls NO cooldown', !(p.skillCd && p.skillCd.EARTHSHATTER), p.skillCd);
  u = ultCharge(st, 'EARTHSHATTER');
  ok('refused cast leaves the ult fully charged', u.charge === 40, u);

  // CAST PAID: pool refilled to exactly enough + 10.
  p.mana = ULT_COST + 10;
  keyHandler({ key: 'q', preventDefault: noop });
  ok('a cast with enough mana spends EXACTLY 60, once', p.mana === 10, p.mana);
  ok('the charge is banked (40 kills spent)', (p.ultSpent && p.ultSpent.EARTHSHATTER) === 40, p.ultSpent);
  ok('the cooldown floor rolled on', (p.skillCd.EARTHSHATTER || 0) > 0, p.skillCd);
  u = ultCharge(st, 'EARTHSHATTER');
  ok('the ult reads uncharged after the cast', u.charge === 0, u);

  // The same refusal on the module seam for the other two ults.
  for (const id of ['AFTERIMAGE', 'CONSECRATION']) {
    p.kills = 100; p.skillCd = {}; p.ultSpent = {}; p.mana = 0;
    ok(id + ': module-seam cast refused at 0 mana (nothing spent)',
      useSkill(st, id) === false && p.mana === 0 &&
      !(p.ultSpent && p.ultSpent[id]) && !(p.skillCd && p.skillCd[id]));
    p.mana = 100;
    ok(id + ': module-seam cast paid at full pool (spends exactly 60)',
      useSkill(st, id) === true && p.mana === 40, p.mana);
  }
}

// ---- the surfaces: control + manual ----------------------------------------------
{
  // The shipped source reads affordability on BOTH readouts (touch badge +
  // text HUD): an unaffordable ult shows LOW, never RDY.
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('the touch badge reads mana-short as LOW (not RDY)',
    /const u = ultCharge\(state, defId\);[\s\S]{0,400}LOW/.test(src));
  ok('the text HUD reads mana-short as LOW (not RDY)',
    /const u = ultCharge\(state, id\);[\s\S]{0,400}LOW/.test(src));
  ok('the AUTO-cast gate no longer exempts ults from mana (stale comment gone)',
    !/NEVER mana/.test(src));

  // The manual's Q row states the ULT cost, built from the config at render
  // time (the number can never drift from the code).
  T.startRun();
  T.setPilotMode('MANUAL');
  st.character = { skill: 'EARTHSHATTER' };
  T.manual.goto(3);
  tick(0.2);
  const ovCards = globalThis.document.getElementById('ov-cards');
  const ctlCard = [...ovCards.children].find(c => (c._html || '').includes('YOUR CONTROLS'));
  const K = (ctlCard && ctlCard._html) || '';
  ok('the manual Q row names the ULT and its mana cost (60)',
    /ULT/i.test(K) && K.includes(String(ULT_COST)), K.slice(0, 400));
}

console.log('test_ult_mana: ' + passed + ' checks passed');
