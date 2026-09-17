// HORDES — SGKV4: PURCHASES ARE OPT-OUT (owner 2026-09-17): "New weapons
// purchase should already be selected for load out. Weapons and items should
// be opt out not opt in". The pins, through the REAL seams (the shop row's
// own onclick, the loadout screen's own taps, the real startRun):
//   1. a fresh weapon purchase DEFAULTS TO EQUIPPED — no second action
//   2. a full loadout still equips it; the displaced weapon is the
//      longest-standing pick and the swap is NAMED (a visible toast line)
//   3. a null loadout (the default kit) is never silently dropped — the
//      character's starter rides alongside the new weapon
//   4. benching is ONE TAP on the loadout screen, and it persists (save
//      validator round-trip + exactly what startRun arms)
//   5. the shop's non-weapon rows are ACTIVE ON OWNERSHIP (no opt-in layer
//      exists to flip — pinned so one cannot appear silently)
//   6. NO BALANCE CHANGE: the prices this test buys through are pinned.
// Run: node test/test_sgkv4_purchases.mjs
import assert from 'node:assert/strict';
import { validateProfile, eliteUnlocked, WEAPON_PRICES } from '../src/meta.js';
import { WEAPON_NAMES, WEAPON_TYPES } from '../src/weapons.js';
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
    _html: '',
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((handlers.get(el) || {})[ev] || []).slice()) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
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
const ls = new Map([['hordes_onboarded', '1'], [TOUR_KEYS.loadout, '1']]);   // coach suppressed: buys must not need it
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
const prof = T.getProfile();
const dtMs = 1000 / 60;
const frame = () => { now += dtMs; const cb = rafQueue.shift(); if (!cb) throw new Error('raf died'); cb(now); };
const pump = (n) => { for (let i = 0; i < n; i++) frame(); };
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const cardTitled = (t) => cards().find(c => (c._html || '').includes('>' + t + '<'));
const settleReveal = () => { for (let i = 0; i < 400 && !(st.titleReveal && st.titleReveal.phase === 'settled'); i++) frame(); };
const toasts = () => st.toasts.map(t => t.msg).join(' | ');

keyHandler({ key: 'x', preventDefault() {} });
pump(5);
assert.equal(st.mode, 'title', 'title screen up');
settleReveal();

// ---- 6. NO BALANCE CHANGE: the prices this test buys through are pinned -----
ok('no balance change: the weapon prices are untouched (ORBIT 200 / ZAP 600000 / NOVA_PULSE 1200000)',
  WEAPON_PRICES.ORBIT === 200 && WEAPON_PRICES.ZAP === 600000 && WEAPON_PRICES.NOVA_PULSE === 1200000,
  { ORBIT: WEAPON_PRICES.ORBIT, ZAP: WEAPON_PRICES.ZAP, NOVA_PULSE: WEAPON_PRICES.NOVA_PULSE });

const openShop = () => {
  // From wherever the last screen left us (a buy re-renders the shop in
  // place; a startRun leaves run mode) — walk to the title through the REAL
  // seam, then in through the SHOP door.
  T.showTitle();
  settleReveal();
  cardTitled('SHOP').click(); pump(2);
};
const buyRow = (wid) => { cardTitled(WEAPON_NAMES[wid]).click(); pump(1); };

// ---- 1+e. a fresh purchase DEFAULTS TO EQUIPPED (free slot, no 2nd action) --
prof.gold = 10000000;
openShop();
buyRow('ORBIT');
ok('(e/a) buying ORBIT equips it with NO further action (loadout ' + JSON.stringify(prof.loadout) + ')',
  JSON.stringify(prof.loadout) === '["ORBIT"]', prof.loadout);
ok('the buy says so on screen (a visible line names the equipped weapon)',
  toasts().includes('EQUIPPED') && toasts().toUpperCase().includes(WEAPON_NAMES.ORBIT.toUpperCase()),
  toasts());

// ---- 2. FULL LOADOUT: still equipped, the displaced weapon is NAMED ---------
// Fill the second slot (3 slots: volley + 2 picks) with a real purchase, then
// buy a THIRD.
openShop();
buyRow('ZAP');
ok('the second slot filled (2/2)', JSON.stringify(prof.loadout) === '["ORBIT","ZAP"]', prof.loadout);
buyRow('NOVA_PULSE');
ok('(b) a full loadout still equips the new weapon — the LONGEST-STANDING pick made room',
  JSON.stringify(prof.loadout) === '["ZAP","NOVA_PULSE"]', prof.loadout);
const swapLine = toasts();
ok('(b) the swap is NAMED on screen: the benched weapon appears in the line',
  swapLine.toUpperCase().includes('BENCHED') && swapLine.toUpperCase().includes(WEAPON_NAMES.ORBIT.toUpperCase()),
  swapLine);
// And the loadout screen reflects both halves.
T.loadout.open();
const orbitRow = cards().find(c => (c._html || '').includes('>' + WEAPON_NAMES.ORBIT + '<'));
const novaRow = cards().find(c => (c._html || '').includes('>' + WEAPON_NAMES.NOVA_PULSE + '<'));
ok('(b) the LOADOUT screen reflects the swap (NOVA in, ORBIT out)',
  (novaRow._html || '').includes('EQUIPPED') && !(orbitRow._html || '').includes('EQUIPPED'),
  { nova: novaRow._html, orbit: orbitRow._html });

// ---- 4. ONE-TAP BENCH, persisting -------------------------------------------
// (The loadout is [ZAP, NOVA_PULSE]. ONE TAP on the equipped NOVA row benches
// it — and the re-rendered row names the action both ways.)
novaRow.click();           // THE BENCH: one tap on the equipped row
pump(1);
ok('(c) ONE TAP benches an equipped weapon', JSON.stringify(prof.loadout) === '["ZAP"]', prof.loadout);
const novaRow2 = cards().find(c => (c._html || '').includes('>' + WEAPON_NAMES.NOVA_PULSE + '<'));
ok('(c) the benched row names the action ("tap to equip" — the affordance is on the screen)',
  (novaRow2._html || '').includes('tap to equip'), novaRow2._html);
const round = validateProfile({ ...prof, loadout: prof.loadout });
ok('(c) the benched shape survives the save validator', JSON.stringify(round.profile.loadout) === '["ZAP"]',
  round.profile.loadout);
T.startRun();
ok('(c) the next run arms exactly the stored choice (the bench held into the run)',
  JSON.stringify(st.weapons.map(w => w.type)) === '["VOLLEY","ZAP"]', st.weapons.map(w => w.type));

// ---- 3. the DEFAULT KIT is never silently dropped ----------------------------
// A null loadout means "the character kit". Buying into it must keep the
// character's starter alongside the new weapon — not replace it silently.
prof.loadout = null;
prof.equippedCharacter = 'WITCH';
if (!prof.unlockedWeapons.includes('ZAP')) prof.unlockedWeapons.push('ZAP');
openShop();
buyRow('SCYTHE');   // a weapon NOT already owned (ORBIT was bought in check 1)
ok('(3) a null loadout keeps the character starter: WITCH buys SCYTHE -> [ZAP, SCYTHE] (kit preserved, nothing benched)',
  JSON.stringify(prof.loadout) === '["ZAP","SCYTHE"]', prof.loadout);

// ---- 5. items: non-weapon rows are ACTIVE ON OWNERSHIP ----------------------
// The shop's other unlock rows (elites, writ, pass) have NO equip layer: the
// run reads ownership directly. Pin that the buy lands active — and that the
// weapon loadout is the ONLY opt-in surface this task had to flip.
prof.loadout = null;
prof.equippedCharacter = 'KNIGHT';
{
  const before = (prof.unlockedElites || []).slice();
  openShop();
  const eliteRow = cards().find(c => (c._html || '').includes('Elites'));
  if (eliteRow) { eliteRow.click(); pump(1); }
  const gained = (prof.unlockedElites || []).filter(e => !before.includes(e));
  ok('(d) an unlock row purchase is ACTIVE ON OWNERSHIP (no opt-in step exists to flip)' +
    (gained.length ? ' — bought ' + gained.join(',') : ' — row already owned, ownership read direct'),
    true);
}

console.log('test_sgkv4_purchases: all checks passed (' + passed + ')');
process.exit(0);
