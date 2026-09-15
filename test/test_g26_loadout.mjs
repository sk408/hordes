// HORDES — G26 PRE-RUN WEAPON LOADOUT (owner 2026-09-15: "Player chosen
// weapons in a menu, not during run. Before the run... Replaces in run
// cards. It's a player decision that gets rewarded").
//
// This is the DEDICATED EVENT TEST the brief's tour-contract consequence
// demands: test_tour.mjs carries LOADOUT in DISCOVERY_EXEMPT only because
// the door is EVENT-taught, and this file pays for that exemption by pinning
// the event: no coachmark before the unlocked set grows beyond the starter
// kit; exactly ONE on the first growth; the flag persists and prevents a
// repeat; the door reachable by taps with the coach never fired.
//
// It also pins the slice's other contracts through the REAL seams:
//   - persistence: profile.loadout round-trips the save validator;
//   - the screen: rows for the unlock set, slot cap, DEFAULT KIT clears;
//   - the choice proof: startRun arms the chosen kit, read off LIVE run state;
//   - the pool proof: ZERO wpn_* grants across a draft sweep, lvl_* offers
//     for exactly the brought kit.
// Run: node test/test_g26_loadout.mjs
import assert from 'node:assert/strict';
import { makeProfile, validateProfile } from '../src/meta.js';
import { TOUR_KEYS } from '../src/tour.js';
import { WEAPON_TYPES, WEAPON_NAMES } from '../src/weapons.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- 1. persistence: the loadout round-trips the save validator -------------
{
  const base = makeProfile();
  assert.equal(base.loadout, null, 'a fresh profile has NEVER chosen (null)');
  const keep = validateProfile({ ...base, unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT', 'ZAP'],
    loadout: ['ORBIT', 'ZAP'] });
  ok('a chosen loadout survives validation', JSON.stringify(keep.profile.loadout) === '["ORBIT","ZAP"]', keep.profile.loadout);
  const dropVolley = validateProfile({ ...base, loadout: ['VOLLEY', 'ORBIT'] });
  ok('the base volley is never a pickable slot (dropped, named as a repair)',
    JSON.stringify(dropVolley.profile.loadout) === '["ORBIT"]' && dropVolley.repairs.includes('loadout'),
    dropVolley.profile.loadout);
  const empty = validateProfile({ ...base, loadout: [] });
  ok('an empty selection is "no choice" (null — the default kit), never a zero-weapon run',
    empty.profile.loadout === null, empty.profile.loadout);
  const garbage = validateProfile({ ...base, loadout: 'ORBIT' });
  ok('a wrong-typed loadout repairs to null and NAMES the field',
    garbage.profile.loadout === null && garbage.repairs.includes('loadout'), garbage.repairs);
}

// ---- 2+. the real loop (DOM shims: the test_tour.mjs pattern) ----------------
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
    querySelector(sel) { return (sel === '.tour-skip' && el._html.includes('tour-skip')) ? el : null; },
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
const ls = new Map([['hordes_onboarded', '1']]);   // NO tour flags: the coach event is under test
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
const frame = () => {
  now += dtMs;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(now);
};
const pump = (n) => { for (let i = 0; i < n; i++) frame(); };
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const cardTitled = (t) => cards().find(c => (c._html || '').includes('>' + t + '<'));
const weaponCard = (type) => cards().find(c => (c._html || '').includes('>' + WEAPON_NAMES[type] + '<'));
const tourRoots = () => globalThis.document.body.children.filter(c => c.id === 'tour-root');
const settleReveal = () => { for (let i = 0; i < 400 && !(st.titleReveal && st.titleReveal.phase === 'settled'); i++) frame(); };

// Skip the intro movie -> title (fresh boot, starter weapons only).
keyHandler({ key: 'x', preventDefault() {} });
pump(5);
assert.equal(st.mode, 'title', 'title screen up');
settleReveal();

// The stage-1 title tour fires on the fresh boot (storage has no flags) —
// walk it to the end the way test_tour.mjs does, and pin WHILE it runs that
// it never teaches the LOADOUT door (the DISCOVERY_EXEMPT behaviour).
{
  const root = tourRoots()[0];
  assert.ok(root, 'stage-1 title tour mounted on the fresh boot');
  const taught = [];
  for (let i = 0; i < 12 && tourRoots().length; i++) {
    const tip = root.children.find(c => c.id === 'tour-tip');
    if (tip) taught.push(tip._html);
    root.fire('pointerdown', { stopPropagation() {} });
  }
  ok('the title walk does NOT teach LOADOUT (it is event-taught instead)',
    !taught.some(h => h.includes('LOADOUT')), taught.filter(h => h.includes('LOADOUT')).length);
}

// ---- 3. the coachmark event (the DISCOVERY_EXEMPT payment) -------------------
// (a) NOTHING before the unlocked set grows: the title has been up and settled
// with the LOADOUT door present, and no coachmark is mounted.
ok('no loadout coach before the unlocked set grows (starters only, title settled)',
  tourRoots().length === 0 && ls.get(TOUR_KEYS.loadout) !== '1', tourRoots().length);

// (b) the door is reachable by taps (the click contract) with the coach never
// fired — the exact reachability the exemption promises.
const door = cardTitled('LOADOUT');
ok('the LOADOUT door is a real title card', !!door);
door.click();
ok('tapping the door opens the loadout screen (mode loadout)', st.mode === 'loadout', st.mode);
ok('the screen lists the unlocked slot weapons + DEFAULT KIT + BACK',
  !!weaponCard('BOOMERANG') && !!cardTitled('DEFAULT KIT') && !!cardTitled('BACK'), cards().length);
cardTitled('BACK').click();
ok('BACK returns to the title', st.mode === 'title', st.mode);
settleReveal();

// (c) EXACTLY ONE coachmark on the first growth: unlock ORBIT beyond the
// starter kit and return to the title (the title call site is the shop
// coach's sibling — and the achievement-grant path's first legal moment,
// since the coach must not fire during a run).
prof.unlockedWeapons.push('ORBIT');
T.showTitle();
settleReveal();
pump(2);
const roots = tourRoots();
ok('exactly ONE loadout coach on the first growth', roots.length === 1, roots.length);
const coachTip = roots[0] && roots[0].children.find(c => c.id === 'tour-tip');
ok('the coach tip names the LOADOUT door', !!(coachTip && coachTip._html.includes('LOADOUT')), coachTip && coachTip._html);
ok('the flag is set the moment it fires (once only, tour flag store)',
  ls.get(TOUR_KEYS.loadout) === '1', ls.get(TOUR_KEYS.loadout));

// (d) the flag persists and prevents a repeat.
roots[0].fire('pointerdown', { stopPropagation() {} });   // dismiss like every coachmark
T.showTitle();
settleReveal();
pump(2);
ok('the flag prevents a second coach (re-entering the title)', tourRoots().length === 0, tourRoots().length);

// (e) a seen flag suppresses the coach on a NEW growth too.
prof.unlockedWeapons.push('ZAP');
T.showTitle();
settleReveal();
pump(2);
ok('a seen flag suppresses the coach on a NEW growth', tourRoots().length === 0, tourRoots().length);

// No more tour pauses for the rest of the file.
for (const k of Object.values(TOUR_KEYS)) ls.set(k, '1');

// ---- 4. the screen: selection, slot cap, DEFAULT KIT -------------------------
T.loadout.open();
const expectOrder = Object.keys(WEAPON_TYPES).filter(id => prof.unlockedWeapons.includes(id));
ok('the screen enumerates the unlock set in registry order',
  expectOrder.every(id => !!weaponCard(id)) &&
  cards().filter(c => expectOrder.some(id => (c._html || '').includes('>' + WEAPON_NAMES[id] + '<')))
    .map(c => expectOrder.find(id => (c._html || '').includes('>' + WEAPON_NAMES[id] + '<'))).join(',')
    === expectOrder.join(','),
  expectOrder.join(','));
weaponCard('ORBIT').click();
ok('a tap selects (stored immediately, persisted shape)',
  JSON.stringify(prof.loadout) === '["ORBIT"]', prof.loadout);
weaponCard('ZAP').click();
ok('a second tap fills the second slot (3 slots: volley + 2 picks)',
  JSON.stringify(prof.loadout) === '["ORBIT","ZAP"]', prof.loadout);
weaponCard('BOOMERANG').click();
ok('the slot cap refuses a third pick (the menu never exceeds the run cap)',
  JSON.stringify(prof.loadout) === '["ORBIT","ZAP"]', prof.loadout);
weaponCard('ZAP').click();
ok('a tap on a SELECTED weapon deselects it',
  JSON.stringify(prof.loadout) === '["ORBIT"]', prof.loadout);
cardTitled('DEFAULT KIT').click();
ok('DEFAULT KIT clears the choice to null (the zero-penalty default)',
  prof.loadout === null, prof.loadout);

// ---- 5. the choice proof: the run carries what was chosen (LIVE state) -------
prof.loadout = ['ORBIT', 'ZAP'];
T.startRun();
const goodKit = st.weapons.map(w => w.type);
ok('chosen kit: startRun arms VOLLEY + the loadout, read off LIVE run state',
  JSON.stringify(goodKit) === '["VOLLEY","ORBIT","ZAP"]', goodKit);
prof.loadout = ['BOOMERANG'];       // the deliberately poor kit
T.startRun();
const poorKit = st.weapons.map(w => w.type);
ok('poor kit: a different choice arms a different kit', JSON.stringify(goodKit) !== JSON.stringify(poorKit),
  { goodKit, poorKit });
// Zero penalty for never visiting: no stored choice -> exactly today's kit
// (VOLLEY + the character's starting weapon when unlocked, nothing else).
prof.loadout = null;
T.startRun();
const ch = st.character;
const expectDefault = ['VOLLEY'].concat(
  ch.startingWeapon && prof.unlockedWeapons.includes(ch.startingWeapon) ? [ch.startingWeapon] : []);
ok('no stored choice -> the same starting kit a fresh account has today',
  JSON.stringify(st.weapons.map(w => w.type)) === JSON.stringify(expectDefault),
  { got: st.weapons.map(w => w.type), expectDefault });
// A loadout naming a weapon the save does NOT own never arms it (import rule).
prof.unlockedWeapons = prof.unlockedWeapons.filter(w => w !== 'ZAP');
prof.loadout = ['ORBIT', 'ZAP'];
T.startRun();
ok('an unowned loadout entry is dropped at startRun (validated against the LIVE unlock set)',
  JSON.stringify(st.weapons.map(w => w.type)) === '["VOLLEY","ORBIT"]', st.weapons.map(w => w.type));
prof.unlockedWeapons.push('ZAP');

// ---- 6. the pool proof: the draft never grants a weapon ----------------------
// Full unlocked set, chosen kit ORBIT+ZAP: sweep drafts and read the REAL
// offer objects (el._draftOffer is the exact card openDraft built).
prof.loadout = ['ORBIT', 'ZAP'];
T.startRun();
const realRandom = Math.random;
Math.random = (function () { let s = 20260915; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
const families = { wpn: 0, lvl: 0, stat: 0, other: 0 };
const lvlTypes = new Set();
const DRAWS = 200;
try {
  for (let i = 0; i < DRAWS; i++) {
    T.openDraft();
    for (const c of cards()) {
      const u = c._draftOffer;
      if (!u) continue;
      if (u.id.startsWith('wpn_')) families.wpn++;
      else if (u.id.startsWith('lvl_')) { families.lvl++; lvlTypes.add(u.id.split('_')[1]); }
      else if (/^(rule_|skill_|rewrite_|frost)/.test(u.id)) families.stat++;
      else families.other++;
    }
    st.mode = 'playing';   // reopen without picking
  }
} finally { Math.random = realRandom; }
ok('pool proof: ZERO wpn_* grants across ' + DRAWS + ' drafts with the FULL unlock set',
  families.wpn === 0, families);
ok('pool proof: lvl_* offers still flow, for EXACTLY the brought kit',
  families.lvl > 0 && [...lvlTypes].sort().join(',') === ['ORBIT', 'VOLLEY', 'ZAP'].sort().join(','),
  { families, lvlTypes: [...lvlTypes] });
console.log('  MEASURED families over ' + DRAWS + ' drafts: ' + JSON.stringify(families) +
  ' · lvl types: ' + [...lvlTypes].sort().join('/'));

console.log('test_g26_loadout: all ' + passed + ' checks passed');
