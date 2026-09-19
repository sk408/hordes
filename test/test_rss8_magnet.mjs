// HORDES — RSS8: MAGNET COLLECTOR (owner 2026-09-17): "We could have a magnet
// collector card. A very rare card that gives a skill to collect all drops
// every 30 seconds." Pins, through the REAL seams (the draft's own openDraft
// + card click, the run's own keydown act, the real pickup loop, the real
// auto-cast gate):
//   1. GROUND: "very rare" maps onto the MYTHIC ladder tier — the TOP draft
//      tier that exists (run-gated chase pool). No new tier is invented; the
//      card rides the SAME weight knob (draftLadderWeight MYTHIC) as every
//      other mythic, so it cannot appear more often than its family.
//   2. the draft offers it ONLY through the chase gate (state.chasePool) and
//      only ONCE per run (the takenStats ledger), taken through the real
//      card click; the pick toast names it MYTHIC.
//   3. the skill collects EVERY drop type (gems, potions, items) through the
//      ONE credit path — the normal pickup loop (XP mults, potion cap, equip
//      decisions all respected; over-cap potions stay on the floor, value
//      never destroyed).
//   4. the cooldown is EXACTLY 30s and cannot be spammed; the collected
//      total is DISPLAYED (a MAGNET SWEEP line with per-type counts).
//   5. parity both ways: the manual act ('x' / the touch button) fires it;
//      the AUTO-PILOT fires it on the stated floor-value policy; without the
//      card the act is a no-op.
//   6. NO BALANCE CHANGE: the skill's own constants are pinned here, and the
//      existing skills' constants are untouched.
// Run: node test/test_rss8_magnet.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, DRAFT_LADDER, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { draftLadderWeight } from '../src/meta.js';
import { rollItemOfRarity } from '../src/loot.js';
import { TOUR_KEYS } from '../src/tour.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- the real loop (DOM shims: the test_g26_loadout.mjs pattern) -----------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const handlers = new WeakMap();
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: {}, children: [], parentNode: null, onclick: null,
    hidden: false, textContent: '',
    _html: '',
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((handlers.get(el) || {})[ev] || []).slice()) cb(arg); },
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
    click() { if (el.onclick) el.onclick(); el.fire('click'); },
    getContext: () => fakeCtx,
    width: 0, height: 0,
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; },
  });
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = mk()),
  createElement: () => mk(),
  body: mk(),
  addEventListener() {},
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; }, innerWidth: 480, innerHeight: 300 };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
const ls = new Map([['hordes_onboarded', '1']]);   // no intro reference
// FIRST-RUN PROLOGUE neutralization (the _harness.mjs convention,
// 2026-09-18): without this stamp the skill-battery run below is run #1 of a
// fresh profile — the prologue's all-buttons-disabled lockout would swallow
// the very 'x' act this file exists to prove fires.
ls.set('hordes_profile_v1', JSON.stringify({ version: 8, achievements: { totals: { runs: 1 } } }));
// Coach suppressed (the tour's own localStorage flags): the drafts this test
// opens would otherwise summon the draft coach, whose overlay parks the keys.
for (const k of Object.values(TOUR_KEYS)) ls.set(k, '1');
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
const dtMs = 1000 / 60;
const frame = () => { now += dtMs; const cb = rafQueue.shift(); if (!cb) throw new Error('raf died'); cb(now); };
const pump = (n) => { for (let i = 0; i < n; i++) frame(); };
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const toasts = () => st.toasts.map(t => t.msg).join(' | ');
const magnetCard = () => cards().find(c => (c._html || '').includes('Magnet Collector'));
// MONOTONIC sweep count: st.toasts is transient (4s TTL), so live-counting the
// MAGNET SWEEP lines is flaky across 30s cooldown waits. Every array ever
// assigned to state.toasts gets a counting push (startRun reassigns it, so a
// one-time wrap is not enough).
let sweepTotal = 0;
let lastSweepMsg = null;
{
  const arm = (v) => {
    const orig = v.push.bind(v);
    v.push = (...xs) => {
      for (const x of xs) if (x && /MAGNET SWEEP/.test(String(x.msg))) { sweepTotal++; lastSweepMsg = x.msg; }
      return orig(...xs);
    };
    return v;
  };
  let cur = arm(st.toasts);
  Object.defineProperty(st, 'toasts', { configurable: true, get: () => cur, set: (v) => { cur = arm(v); } });
}
const grant = () => { if (!st.player.skills) st.player.skills = {}; st.player.skills.magnet = true; };
const held = () => !!(st.player.skills && st.player.skills.magnet);
// Far from the player, beyond any pickup radius, inside the field.
const far = () => {
  const p = st.player;
  return { x: p.x + 400, y: p.y + 400 };
};
// Pump with the player kept alive — the run is LIVE while we loop drafts and
// wait out cooldowns, and an idle knight dies long before 30s of sim time.
const run = (n) => {
  for (let i = 0; i < n; i++) {
    if (st.player && st.player.hp !== undefined) st.player.hp = 1e9;
    frame();
  }
};
// Pump until the magnet cooldown has FULLY elapsed. The cooldown ticks only
// inside update(), which legitimately skips frames (boss banners, level-up
// drafts, coach holds), so a fixed frame count under-waits a live run — the
// VALUE is the contract, so we wait on the value. The floor is kept drained
// while waiting so the AUTO pilot's own floor-value policy cannot spend the
// recovered charge before the manual act under test fires it.
const waitCd = () => {
  let frames = 0;
  // Keep the AUTO pilot's own floor-value policy OUT of the wait (it would
  // happily spend the charge the moment the cooldown recovers).
  const had = !!(st.player.skills && st.player.skills.magnet);
  if (had) delete st.player.skills.magnet;
  while (st.player.skillCd.MAGNET_PULL > 0 && frames < 60 * 120) {
    st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0;
    run(1); frames++;
  }
  if (had) st.player.skills.magnet = true;
  // The run ladder can have parked us anywhere over 30s of sim (a draft, an
  // intermission). The acts under test are playing-gated, so return to the
  // live mode (the same seam the draft loops above already use) and give the
  // badge/HUD sync a few real playing frames.
  if (st.mode !== 'playing') st.mode = 'playing';
  run(3);
  return frames;
};
// Pump until the floor is drained AND the sweep itself has completed (or the
// bound hits), resolving any level-up draft through the REAL card click: a
// draft parks update() and would otherwise freeze the pickup loop mid-sweep
// with drops already at the player's feet — and the floor can legally empty
// BEFORE the sweep's 0.45s is up, so the completion toast needs the extra
// frames regardless. The field is kept enemy-free so AMBIENT kills cannot
// add drops behind the sweep and blur the drained-floor assertions.
// SPAWN PIN (2026-09-18, brief TOUR_NEGATIVE_WINDOW_HARDENING step 3): the
// clear alone ran BEFORE frame(), so an enemy spawning AND dying inside the
// same pumped frame still seeded a gem behind the assertions (suite capture
// 20260918T220741Z: leg 5a red with the floor swept by a 25th ambient gem).
// spawnTimer is the real spawn gate (src/main.js:1475-1476) — pinning it makes
// the enemy-free claim above TRUE instead of probabilistic.
const settle = (bound) => {
  for (let i = 0; i < bound &&
       ((st.gems.length || st.drops.length || st.itemDrops.length) ||
        (st.player && st.player.magnetSweep > 0)); i++) {
    if (st.mode === 'draft') { const c = cards(); if (c.length) c[0].click(); }
    st.enemies.length = 0;
    st.spawnTimer = 1e9;
    st.player.hp = 1e9;
    frame();
  }
};
const seedFloor = (gems = 12, potions = 2, items = 1) => {
  const q = far();
  for (let i = 0; i < gems; i++) T.m3.pushGem({ x: q.x + i, y: q.y, xp: 5 });
  for (let i = 0; i < potions; i++) T.m3.pushDrop({ x: q.x, y: q.y + i, kind: i === 0 ? 'hp' : 'mp', count: 1 });
  for (let i = 0; i < items; i++) T.m3.pushItemDrop({ x: q.x - i, y: q.y, item: rollItemOfRarity('COMMON'), age: 0 });
};

keyHandler({ key: 'x', preventDefault() {} });
pump(5);
assert.equal(st.mode, 'title', 'title screen up');

// ---- 1. GROUND: "very rare" maps onto the MYTHIC tier ----------------------
const magnetDef = DRAFT_MYTHIC_UPGRADES.find(u => u.id === 'magnet_collector');
ok('(1) the card exists in the MYTHIC ladder (the top draft tier — no new tier invented)',
  !!magnetDef && DRAFT_MYTHIC_UPGRADES.some(u => u.id === 'second_wind'),
  DRAFT_MYTHIC_UPGRADES.map(u => u.id));
ok('(1) it rides the SHARED mythic weight knob (same rate as its family, never more often)',
  draftLadderWeight('magnet_collector', 'MYTHIC', 0) === DRAFT_LADDER.MYTHIC_WEIGHT &&
  draftLadderWeight('magnet_collector', 'MYTHIC', 0) === 0.10);
ok('(6) its own constants are pinned (cooldown EXACTLY 30s, no mana price — the cooldown is the cost)',
  C.SKILLS.MAGNET_PULL.COOLDOWN === 30 && C.SKILLS.MAGNET_PULL.MANA === 0,
  C.SKILLS.MAGNET_PULL);
ok('(6) NO BALANCE CHANGE: the existing skills are untouched (FROST_NOVA 8s/30m, OVERCHARGE 12s/25m)',
  C.SKILLS.FROST_NOVA.COOLDOWN === 8 && C.SKILLS.FROST_NOVA.MANA === 30 &&
  C.SKILLS.OVERCHARGE.COOLDOWN === 12 && C.SKILLS.OVERCHARGE.MANA === 25);

// ---- 2. the draft path (the real openDraft + the real card click) ----------
T.startRun();
pump(10);
assert.equal(st.mode, 'playing', 'run live');
// (a) NO chase gate -> never offered, ever.
st.chasePool = {};
let offeredNoGate = 0;
for (let i = 0; i < 300; i++) {
  T.openDraft();
  if (magnetCard()) offeredNoGate++;
  cards()[0].click(); run(2);
  if (st.mode !== 'playing') st.mode = 'playing';
}
ok('(2) without the chase-gate roll the card is NEVER offered (0/300 drafts)', offeredNoGate === 0, offeredNoGate);

// (b) WITH the gate: offered, taken through the real click, once per run.
st.chasePool = { magnet_collector: true };
let takeAt = -1, appearances = 0;
for (let i = 0; i < 1000 && takeAt < 0; i++) {
  T.openDraft();
  if (magnetCard()) { appearances++; takeAt = i; magnetCard().click(); run(2); }
  else { cards()[0].click(); run(2); }
  if (st.mode !== 'playing') st.mode = 'playing';
}
ok('(2) with the chase roll the draft offers it (appeared at draft ' + takeAt + ' of the loop)', takeAt >= 0);
ok('(2) taking it GRANTS the skill (p.skills.magnet) and records the once-per-run ledger',
  held() && (st.player.takenStats || {}).magnet_collector === 1,
  { held: held(), taken: st.player.takenStats });
ok('(2) the pick announces MYTHIC on screen', toasts().includes('MYTHIC') && toasts().toUpperCase().includes('MAGNET COLLECTOR'), toasts());
let reoffers = 0;
for (let i = 0; i < 100; i++) {
  T.openDraft();
  if (magnetCard()) reoffers++;
  cards()[0].click(); run(2);
  if (st.mode !== 'playing') st.mode = 'playing';
}
ok('(2) taken once, it leaves the pool for the rest of the run (0 re-offers in 100 drafts)', reoffers === 0, reoffers);

// ---- 3+4. the skill through the REAL key act + pickup loop ------------------
// A FRESH run for the skill battery (the draft loops above aged this one —
// waves rolled and the field moved). The card's grant path is already proven
// above, so re-arm the same flag the pick wrote and fire through the REAL act.
T.startRun();
run(10);
assert.equal(st.mode, 'playing', 'skill-battery run live');
grant();
seedFloor(12, 2, 1);
const xpBefore = st.player.xp, potionsBefore = { ...st.player.potions }, itemsBefore = st.items.length;
keyHandler({ key: 'x', preventDefault() {} });   // THE MANUAL ACT
ok('(4) the act FIRES (cooldown armed at exactly 30s)', st.player.skillCd.MAGNET_PULL === 30, st.player.skillCd.MAGNET_PULL);
settle(300);   // the sweep pulls; the normal pickup loop credits (drafts resolved)
ok('(3) every GEM left the floor through the one credit path (XP banked)', st.gems.length === 0 && st.player.xp > xpBefore,
  { gems: st.gems.length, xp: st.player.xp - xpBefore });
ok('(3) every POTION left the floor (both kinds, under the cap)', st.drops.length === 0 &&
  st.player.potions.hp > potionsBefore.hp && st.player.potions.mp > potionsBefore.mp,
  { drops: st.drops.length, hp: st.player.potions.hp, mp: st.player.potions.mp });
ok('(3) the ITEM left the floor and went through the real equip decision', st.itemDrops.length === 0 && st.items.length > itemsBefore,
  { itemDrops: st.itemDrops.length, items: st.items.length });
ok('(4) the collected total is DISPLAYED with per-type counts',
  /MAGNET SWEEP/.test(String(lastSweepMsg)) && /12 GEMS/.test(String(lastSweepMsg)) &&
  /2 POTIONS/.test(String(lastSweepMsg)) && /1 ITEM/.test(String(lastSweepMsg)),
  lastSweepMsg);   // captured at toast-push: a 4s TTL can expire across settle()

// (b) cannot be spammed: the cooldown refuses a second sweep.
seedFloor(5, 0, 0);
const spamBase = sweepTotal;
keyHandler({ key: 'x', preventDefault() {} });
run(70);
ok('(4) the cooldown refuses a second sweep inside 30s', sweepTotal === spamBase && st.gems.length === 5,
  { sweeps: sweepTotal, gems: st.gems.length });
waitCd();   // 30s of cooldown, on the value (update() skips banner/draft frames)
ok('(4) the cooldown has fully elapsed at 30s', st.player.skillCd.MAGNET_PULL <= 0, st.player.skillCd.MAGNET_PULL);
seedFloor(5, 0, 0);   // the wait drained the floor — re-seed for the re-fire
const refireBase = sweepTotal;
keyHandler({ key: 'x', preventDefault() {} });
settle(300);
ok('(4) and then it fires again (the 30s rhythm)', st.gems.length === 0 && sweepTotal === refireBase + 1,
  { gems: st.gems.length, sweeps: sweepTotal });

// (c) the potion cap is respected: an over-cap potion STAYS on the floor.
waitCd();   // the re-fire above re-armed the 30s — lapse it before (c) casts
st.player.potions.hp = st.potionCap;
{ // 3 hp potions at cap (ground potions only merge at the ARRAY cap, so the
  // honest expectation is three refused drops, every one intact on the floor)
  const q = far();
  for (let i = 0; i < 3; i++) T.m3.pushDrop({ x: q.x, y: q.y + i, kind: 'hp', count: 1 });
}
keyHandler({ key: 'x', preventDefault() {} });
run(70);
ok('(3) the run\'s potion cap is respected — over-cap potions stay on the floor (value never destroyed)',
  st.drops.length === 3 && st.drops.every(d => d.kind === 'hp') &&
  st.player.potions.hp === st.potionCap,
  { drops: st.drops, potions: st.player.potions });

// ---- 5. parity: auto policy + the no-card no-op -----------------------------
// (a) AUTO: below the floor threshold -> never fires. The field is kept
// enemy-free so ambient kills cannot seed drops and push the floor over the
// threshold from under the check — and the spawn pin makes that TRUE: the
// clear alone ran before frame(), so a same-frame spawn+kill still seeded a
// 25th gem (the suite capture's `:: 0`).
waitCd();   // (c)'s cast re-armed the 30s — lapse it so AUTO starts from RDY
grant();   // (still held from the draft; explicit for this section)
st.gems = []; st.drops = []; st.itemDrops = [];
for (let i = 0; i < C.MAGNET.AUTO_MIN - 1; i++) T.m3.pushGem({ x: st.player.x + 400, y: st.player.y, xp: 5 });
for (let i = 0; i < 120; i++) { st.enemies.length = 0; st.spawnTimer = 1e9; st.player.hp = 1e9; frame(); }
ok('(5) AUTO does not fire below the floor-value threshold (' + (C.MAGNET.AUTO_MIN - 1) + ' drops)', st.gems.length === C.MAGNET.AUTO_MIN - 1,
  st.gems.length);
// (b) AUTO: at/over the threshold -> fires on its own.
for (let i = 0; i < 40; i++) T.m3.pushGem({ x: st.player.x + 400, y: st.player.y, xp: 5 });
for (let i = 0; i < 10; i++) { st.enemies.length = 0; st.spawnTimer = 1e9; st.player.hp = 1e9; frame(); }
settle(300);    // then the normal pickup loop drains the floor
ok('(5) AUTO fires the sweep on its own at/over the threshold (floor drained)', st.gems.length === 0, st.gems.length);
// (c) WITHOUT the card the manual act is a no-op.
T.startRun(); run(10);
seedFloor(5, 0, 0);
keyHandler({ key: 'x', preventDefault() {} });
run(70);
ok('(5) without the card the act is a NO-OP (nothing fired, floor untouched)',
  !held() && st.gems.length === 5 && !(st.player.skillCd.MAGNET_PULL > 0),
  { held: held(), gems: st.gems.length, cd: st.player.skillCd.MAGNET_PULL });
// (d) the touch button badge reads the real cooldown (RDY <-> seconds).
grant(); seedFloor(C.MAGNET.AUTO_MIN + 5, 0, 0);
keyHandler({ key: 'x', preventDefault() {} }); run(3);
ok('(5) the touch badge reads the live cooldown (seconds while cooling)', /^\d+(\.\d+)?s$/.test(String(elements['tc-mag'].textContent)),
  elements['tc-mag'].textContent);
waitCd();
ok('(5) the touch badge reads RDY when the cooldown lapses', elements['tc-mag'].textContent === 'RDY', elements['tc-mag'].textContent);

console.log('test_rss8_magnet: all checks passed (' + passed + ')');
process.exit(0);
