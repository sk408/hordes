// v10 RUN-COUNT MILESTONE CHESTS (owner 2026-09-17): "After it lands, we
// need to work to reward players for the number of runs they've played. We
// have run 50 start with a big chest on the screen that pilot collects and
// it could reward maybe 10 runs worth of gold. Same at 100, 200, and 500."
//
// What this file pins:
//   TABLE     the milestones are ONE constant ([50,100,200,500], 10 runs
//             worth) — the same object main.js reads, not a second copy.
//   GATE      a chest is due at EXACTLY 50/100/200/500 (run counts when it
//             STARTS); a JUMPED counter still pays (crossing is >=); one
//             chest at a time, smallest unclaimed first; claimed >= milestone
//             means never again (a single monotonic number, no set).
//   GOLD      the reward is NUMERIC against the documented basis: 10x the
//             player's stored lifetime average (totals.gold / totals.runs),
//             floored at RUN_GOLD.AWARD (70 — PACING §1's fresh-run floor)
//             and capped at 754,689/run (PACING §1's tier-3 measured max).
//   MIGRATE   a v9 save migrates to v10 with milestoneChest 0, lossless;
//             garbage repairs to 0 and NAMES the field; a valid claim passes.
//   SPAWN     the REAL startRun spawns the chest on the crossing run,
//             clamped on-screen, and NOTHING despawns it (frames pass, the
//             chest stays; only collection clears it).
//   COLLECT   the real payoff banks the gold DIRECTLY (not the purse),
//             claims + persists in ONE save (the bytes change on the tap),
//             opens the card that says what was gained, resumes on GOT IT,
//             and pays exactly once (the second collect is a no-op).
//   UNLOSABLE a run ended without collecting re-offers the SAME chest next
//             startRun (claim-at-collection, not claim-at-spawn).
//   PILOT     the auto pilot beelines for the chest (act CHEST, vector
//             points at it) when calm, and FLEE still outranks it (the
//             celebration never walks the player through a horde).
// Run: node test/test_runchests.mjs
import assert from 'node:assert';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- stub DOM (test_whatsnew.mjs pattern) -----------------------------------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
    _html: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) {
      const i = ref ? el.children.indexOf(ref) : -1;
      if (i < 0) el.children.push(c); else el.children.splice(i, 0, c);
      c.parentNode = el; return c;
    },
    remove() { if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i >= 0) el.parentNode.children.splice(i, 1); el.parentNode = null; } },
    getBoundingClientRect() { return { left: 10, top: 10, right: 90, bottom: 60, width: 80, height: 50 }; },
    click() { if (el.onclick) el.onclick(); },
    getContext: () => fakeCtx,
    width: 0, height: 0,
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (v === '') el.children.length = 0; },
  });
  Object.defineProperty(el, 'textContent', { get() { return el._html.replace(/<[^>]*>/g, ''); }, set(v) { el._html = String(v); } });
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
globalThis.window = {
  addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; },
  innerWidth: 480, innerHeight: 300,
  matchMedia: () => ({ matches: false }),
};
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };

// A RETURNING PLAYER one run short of the first milestone: a v9 payload (the
// pre-chest schema) with real earned facts. runs 49, lifetime gold 3430 —
// average exactly 70g/run, so the chest's arithmetic is exact: 10 x 70 = 700.
const OLD_SAVE = { version: 9, gold: 512, purchased: { dmg: 2 },
  unlockedWeapons: ['VOLLEY', 'BOOMERANG'], unlockedElites: [],
  runPurse: 0, apex: {}, lastPlayed: 1893456000000, lastSeenUpdate: '2026-09-18',
  achievements: { totals: { runs: 49, gold: 3430 } } };
const ls = new Map([['hordes_onboarded', '1'],
  ['hordes_profile_v1', JSON.stringify(OLD_SAVE)]]);
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};
const stored = () => JSON.parse(ls.get('hordes_profile_v1'));

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
const CH = T.runChests;
const frame = () => { now += 1000 / 60; const cb = rafQueue.shift(); if (!cb) throw new Error('raf died'); cb(now); };

// ---- 1. THE TABLE: one constant, the real object ----------------------------
{
  const meta = await import('../src/meta.js');
  ok('the milestones are [50, 100, 200, 500] in ONE table (main reads the same object)',
    assert.deepStrictEqual(CH.table.MILESTONES, [50, 100, 200, 500]) === undefined &&
    CH.table === meta.RUN_CHESTS);
  ok('the reward is 10 runs\' worth (the owner\'s "maybe 10 runs worth of gold")',
    CH.table.RUNS_WORTH === 10);
}

// ---- 2. THE GATE: pure matrix (run counts when it STARTS; >=, never ===) ----
{
  ok('DUE at exactly 50 (the run that crosses the milestone carries it)',
    CH.next(50, 0) === 50);
  ok('NOT DUE at 49 (one run short)', CH.next(49, 0) === null);
  ok('A JUMPED COUNTER STILL PAYS: 51 starts -> the 50 chest (crossing is >=)',
    CH.next(51, 0) === 50);
  ok('a FAR-jumped counter pays one at a time, smallest unclaimed first',
    CH.next(600, 0) === 50 && CH.next(600, 50) === 100 &&
    CH.next(600, 100) === 200 && CH.next(600, 200) === 500);
  ok('CLAIMED means never again (claimed >= milestone, one monotonic number)',
    CH.next(50, 50) === null && CH.next(100, 100) === null &&
    CH.next(500, 500) === null && CH.next(1000, 500) === null);
  ok('milestone 100 due exactly at 100 started, 99 not yet',
    CH.next(100, 50) === 100 && CH.next(99, 50) === null);
  ok('milestone 499 does not pay 500; 500 does',
    CH.next(499, 200) === null && CH.next(500, 200) === 500);
}

// ---- 3. THE GOLD: numeric against the documented basis -----------------------
{
  ok('10x the stored lifetime average (3430/49 = 70 -> exactly 700)',
    CH.gold({ runs: 49, gold: 3430 }) === 700);
  ok('the floor: a sparse/absent history floors at 10 x RUN_GOLD.AWARD (70)',
    CH.gold({}) === 700 && CH.gold({ runs: 3, gold: 30 }) === 700);
  ok('a partial build pays its own average (1000/10 = 100 -> 1000)',
    CH.gold({ runs: 10, gold: 1000 }) === 1000);
  ok('the CAP: no chest exceeds 10 x the measured maxed-run income (754,689)',
    CH.gold({ runs: 200, gold: 1e11 }) === 754689 * 10);
}

// ---- 4. THE MIGRATION: v9 -> v10 lossless + repair ---------------------------
{
  const meta = await import('../src/meta.js');
  const fakeStorage = (obj) => ({ _m: new Map([['hordes_profile_v1', JSON.stringify(obj)]]),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } });
  const res = meta.loadProfileResult(fakeStorage({ ...OLD_SAVE }));
  ok('the v9 save migrated (v9->v10 step ran)',
    res.status === 'migrated' && res.migrations.includes(9),
    { status: res.status, migrations: res.migrations });
  ok('milestoneChest migrates to 0 (NO chest is pre-claimed for an older save)',
    res.profile.milestoneChest === 0, res.profile.milestoneChest);
  ok('the migration is LOSSLESS: gold, purchases, unlocks, runs, lifetime gold survive',
    res.profile.gold === 512 && res.profile.purchased.dmg === 2 &&
    res.profile.unlockedWeapons.includes('BOOMERANG') &&
    res.profile.achievements.totals.runs === 49 &&
    res.profile.achievements.totals.gold === 3430,
    { gold: res.profile.gold, runs: res.profile.achievements.totals.runs });
  const bad = meta.loadProfileResult(fakeStorage({ ...OLD_SAVE, milestoneChest: 'lots' }));
  ok('garbage milestoneChest repairs to 0 and NAMES the field',
    bad.repairs.includes('milestoneChest') && bad.profile.milestoneChest === 0);
  const neg = meta.loadProfileResult(fakeStorage({ ...OLD_SAVE, milestoneChest: -5 }));
  ok('a negative claim clamps UP to 0 (the safe direction is re-offer, never skip)',
    neg.profile.milestoneChest === 0 && neg.repairs.includes('milestoneChest'));
  const good = meta.loadProfileResult(fakeStorage({ ...OLD_SAVE, version: 10, milestoneChest: 200 }));
  ok('a valid claim passes through untouched (no repair, status current)',
    good.status === 'current' && good.profile.milestoneChest === 200);
}

// ---- 5. THE SPAWN: the REAL startRun, clamped, never despawns ----------------
{
  const prof = T.getProfile();
  ok('fixture: the boot migrated the v9 save (runs 49, one run short)',
    prof.achievements.totals.runs === 49 && prof.milestoneChest === 0);
  T.startRun();
  ok('the crossing run (run #50) spawns the milestone chest',
    !!st.runChest && st.runChest.milestone === 50, st.runChest);
  ok('the chest is placed on-screen (clamped like the prologue potion)',
    st.runChest.x >= 30 && st.runChest.x <= 450 && st.runChest.y >= 40 && st.runChest.y <= 260,
    { x: st.runChest.x, y: st.runChest.y });
  ok('the chest is a real walk from the spawn (up-LEFT, the potion\'s mirror)',
    st.runChest.x < st.player.x && Math.abs(st.runChest.x - st.player.x) >= 60,
    { chest: st.runChest.x, player: st.player.x });
  // NO DESPAWN: frames pass, the chest stays. Only collection clears it.
  // (60 frames — one second — keeps this arm ABOUT time: the real autopilot
  // beelines for the chest and would collect it inside ten seconds, which is
  // exactly the WALK-IN payoff pinned as its own check in section 9b.)
  for (let i = 0; i < 60; i++) frame();
  ok('NOTHING despawns the chest (a second of frames later it is still on the field)',
    !!st.runChest && st.runChest.milestone === 50);
}

// ---- 6. THE COLLECT: bank + claim + card, exactly once -----------------------
{
  const prof = T.getProfile();
  const goldBefore = prof.gold;
  const rawBefore = ls.get('hordes_profile_v1');
  CH.collect();
  ok('the payoff BANKS the gold directly (512 + 700 = 1212, NOT the purse)',
    prof.gold === 1212 && prof.runPurse === 0, { gold: prof.gold, purse: prof.runPurse });
  ok('the claim + the bank ride ONE save (the persisted bytes changed on the collect)',
    ls.get('hordes_profile_v1') !== rawBefore &&
    stored().milestoneChest === 50 && stored().gold === 1212,
    { stored: stored().milestoneChest, gold: stored().gold });
  ok('the chest is off the field (collect clears it)', st.runChest === null);
  const chestCard = () => elements['ov-cards'].children.find(el => /MILESTONE CHEST/.test(el.innerHTML || ''));
  ok('the card explains WHAT WAS GAINED (mode chest, gold named, milestone named)',
    st.mode === 'chest' && !!chestCard() &&
    /\+700 gold/.test(chestCard().innerHTML) &&
    /RUN 50/.test(elements['ov-title'].textContent || ''),
    { title: elements['ov-title'].textContent, card: chestCard() && chestCard().innerHTML });
  CH.closeCard();
  ok('GOT IT resumes the run (mode back to playing)', st.mode === 'playing');
  const goldAfter = prof.gold;
  CH.collect();
  ok('the payoff fires EXACTLY ONCE (a second collect is a no-op)',
    prof.gold === goldAfter && st.runChest === null);
  // CANNOT FIRE TWICE across runs: claimed 50 means no 50 chest ever again.
  T.startRun();
  ok('the next startRun spawns NO chest for an already-claimed milestone',
    st.runChest === null, st.runChest);
  T.showTitle();
}

// ---- 7. UNLOSABLE: an uncollected chest is re-offered next run ----------------
{
  const prof = T.getProfile();
  prof.achievements.totals.runs = 49;      // still one short (the collect above is test state)
  prof.milestoneChest = 0;
  T.startRun();
  ok('fixture: the 50 chest is up, uncollected', !!st.runChest && st.runChest.milestone === 50);
  T.showTitle();                            // the run ends WITHOUT collecting
  T.startRun();
  ok('UNLOSABLE: the next run re-offers the SAME milestone chest',
    !!st.runChest && st.runChest.milestone === 50);
  CH.collect(); CH.closeCard();             // tidy: claim it
}

// ---- 8. THE JUMP, end to end: 52 settled runs pay 50, then 100, then 200 ------
{
  const prof = T.getProfile();
  // 250 settled runs, none claimed: runsStarted 251 crosses 50, 100, AND 200 —
  // the ladder pays one at a time; 500 waits (251 < 500).
  prof.achievements.totals.runs = 250;
  prof.milestoneChest = 0;
  T.startRun();
  ok('a jumped counter (250 runs, none claimed) pays the 50 chest FIRST',
    st.runChest && st.runChest.milestone === 50);
  CH.collect(); CH.closeCard();
  T.startRun();
  ok('then the 100 chest on the very next run', st.runChest.milestone === 100);
  CH.collect(); CH.closeCard();
  T.startRun();
  ok('then the 200 chest (one at a time, in order)', st.runChest.milestone === 200);
  CH.collect(); CH.closeCard();
  T.startRun();
  ok('the 500 chest waits until its own crossing (251 runs: not yet)', st.runChest === null);
  T.showTitle();
}

// ---- 9. THE PILOT: the auto pathing beelines for the chest --------------------
{
  const { AutoPilotController } = await import('../src/controllers.js');
  const { CONFIG } = await import('../src/config.js');
  // decide()'s cfg is the PLAYER table (main.js:1221 passes C.PLAYER —
  // KITE_DIST lives there), not the AUTOPILOT doctrine table.
  const ctl = new AutoPilotController();
  const p = { x: 0, y: 0, stats: {} };
  const state = { runChest: { milestone: 50, x: 100, y: 0 },
    enemies: [], gems: [], portal: null, groundSeed: 1 };
  const d = ctl.decide(p, state, CONFIG.PLAYER);
  ok('the auto pilot beelines for the chest (act CHEST, vector points at it)',
    ctl.act === 'CHEST' && d.moveX > 0.9 && Math.abs(d.moveY) < 0.1,
    { act: ctl.act, moveX: d.moveX, moveY: d.moveY });
  // FLEE outranks the chest: a threat inside the kite line still dodges.
  const ctl2 = new AutoPilotController();
  const state2 = { runChest: { milestone: 50, x: 100, y: 0 },
    enemies: [{ x: 20, y: 0, hp: 10 }], gems: [], portal: null, groundSeed: 1 };
  const d2 = ctl2.decide(p, state2, CONFIG.PLAYER);
  ok('FLEE still outranks the chest (the celebration never walks into a horde)',
    ctl2.act === 'FLEE' && d2.moveX < 0, { act: ctl2.act, moveX: d2.moveX });
  const ctl3 = new AutoPilotController();
  const state3 = { runChest: null, enemies: [], gems: [], portal: null, groundSeed: 1 };
  ctl3.decide(p, state3, CONFIG.PLAYER);
  ok('no chest on the field: the pilot never reports CHEST', ctl3.act !== 'CHEST');
}

// ---- 9b. THE WALK-IN, end to end: the real autopilot collects + the card ------
{
  const prof = T.getProfile();
  prof.achievements.totals.runs = 99;      // the 100 crossing
  prof.milestoneChest = 50;                // 50 already claimed
  const goldBefore = prof.gold;
  T.startRun();
  if (!st.runChest) throw new Error('fixture: the 100 chest is up');
  // Let the REAL run play: the autopilot beelines for the chest and the
  // pickup fires through the ordinary drop loop (no seam calls).
  let collectedAt = -1;
  for (let i = 0; i < 60 * 20 && collectedAt < 0; i++) {
    frame();
    if (st.runChest === null) collectedAt = i;
  }
  ok('the real autopilot WALKED INTO the chest (collected in ' +
    (collectedAt >= 0 ? (collectedAt / 60).toFixed(1) : 'NEVER') + 's of ordinary play)',
    collectedAt >= 0);
  ok('the walk-in collect BANKS the same reward (fresh totals: floor 70 x 10 = +700)',
    prof.gold === goldBefore + 700, { gold: prof.gold, before: goldBefore });
  const chestCard = () => elements['ov-cards'].children.find(el => /MILESTONE CHEST/.test(el.innerHTML || ''));
  ok('the walk-in collect opens the card (the burst-then-card contract)',
    st.mode === 'chest' && !!chestCard() && /RUN 100/.test(elements['ov-title'].textContent || ''),
    { title: elements['ov-title'].textContent });
  CH.closeCard();
  ok('GOT IT resumes the run after the walk-in collect', st.mode === 'playing');
  ok('the claim PERSISTS (milestoneChest 100 in the store)',
    stored().milestoneChest === 100, stored().milestoneChest);
  T.showTitle();
}

console.log('test_runchests: all ' + passed + ' checks passed');
