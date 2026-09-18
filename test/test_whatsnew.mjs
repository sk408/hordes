// v9 WHAT'S NEW (owner 2026-09-17): "Have we timestamped last played for our
// auto saves yet? We need to if we haven't so we can inform older players of
// significant updates like this. We can give them a fancy paper looking popup
// explaining new features."
//
// What this file pins:
//   STAMP     every persisted save stamps profile.lastPlayed (epoch ms) — and
//             the timestamp MOVES between saves (save, advance the clock, save
//             again, the stored value is LATER — the silent-failure trap).
//   MIGRATE   an older (v8) save migrates to v9 with lastPlayed null and
//             lastSeenUpdate null — lossless: gold/unlocks/earned facts all
//             survive, nothing is invented, nothing demoted. A MISSING
//             timestamp counts as "has not seen the note".
//   VALIDATE   garbage lastPlayed repairs to null (the safe direction) and
//             NAMES the field; a valid stamp passes through untouched.
//   GATE      the note pops for: an EXISTING save, a MARKED release
//             (worthTelling), not yet dismissed (lastSeenUpdate), and a
//             lastPlayed that predates the release date. NOT for: a fresh
//             profile (the PROLOGUE owns the first-run intro — the two
//             systems can never fight), an unmarked release, an active
//             player (lastPlayed after the ship date).
//   SHOW      the paper note rides the REAL title card list (the game's own
//             .card skeleton, parchment class), LAUNCH-only (first title
//             entry per page load), tap-dismisses, and the dismiss PERSISTS
//             lastSeenUpdate — shown once per marked release, across
//             reloads. After the dismiss the title is fully playable.
//   VETERAN   (addendum 2026-09-17, ruled OPT-IN: "would have to be opt-in.
//             Ask them if they want to see it") the note MAKES THE OFFER (an
//             obvious accept button). Declining = normal play + the release
//             marked seen. Accepting starts the SAME guided run a new player
//             gets, flagged ASSISTED (B6: full gold, EXCLUDED from best-run
//             records). REPLAY TOUR re-arms a declined offer. Nothing
//             automatic ever happens to a returning player.
// Run: node test/test_whatsnew.mjs
import { TOUR_KEYS } from '../src/tour.js';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}

// ---- stub DOM (test_draft_ceremony.mjs pattern; +insertBefore for the
// note's prepend) -----------------------------------------------------------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { if (p === 'fillStyle' || p === 'globalAlpha') return undefined; return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const handlers = new WeakMap();
const mk = () => {
  const el = {
    tagName: 'div', className: '', id: '', style: { cssText: '' }, children: [], parentNode: null, onclick: null,
    _html: '',
    // v9 ADDENDUM: the veteran guided run arms the REAL prologue, whose button
    // lock rides body.classList (prologueLockButtons) — the stub needs it.
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
    },
    addEventListener(ev, cb) { const h = handlers.get(el) || {}; (h[ev] = h[ev] || []).push(cb); handlers.set(el, h); },
    removeEventListener(ev, cb) { const h = handlers.get(el) || {}; h[ev] = (h[ev] || []).filter(f => f !== cb); },
    fire(ev, arg) { for (const cb of ((handlers.get(el) || {})[ev] || []).slice()) cb(arg); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) {
      const i = ref ? el.children.indexOf(ref) : -1;
      if (i < 0) el.children.push(c); else el.children.splice(i, 0, c);
      c.parentNode = el; return c;
    },
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

// A RETURNING PLAYER'S SAVE, seeded BEFORE main.js imports: a v8 payload (the
// pre-timestamp schema) with real earned facts — gold, a purchase, runs.
const OLD_SAVE = { version: 8, gold: 512, purchased: { dmg: 2 },
  unlockedWeapons: ['VOLLEY', 'BOOMERANG'], unlockedElites: [],
  runPurse: 0, apex: {},
  achievements: { totals: { runs: 7 } } };
const ls = new Map([['hordes_onboarded', '1'],
  ...Object.values(TOUR_KEYS).map(k => [k, '1']),
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
const W = T.whatsNew;
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const noteEl = () => cards().find(el => String(el.className).includes('paper-note'));
const frame = () => { now += 1000 / 60; const cb = rafQueue.shift(); if (!cb) throw new Error('raf died'); cb(now); };

ok('the boot migrated the v8 save (a returning player, not fresh)',
  T.getProfile().gold === 512 && (T.getProfile().achievements.totals.runs || 0) === 7,
  { gold: T.getProfile().gold });

// ---- 1. THE STAMP: every save carries lastPlayed, and it MOVES --------------
{
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => fake;
  try {
    mainMod.autosave('exit');
    const s1 = stored();
    ok('the first save stamps lastPlayed (a real epoch-ms integer)',
      typeof s1.lastPlayed === 'number' && s1.lastPlayed > 0 && Number.isInteger(s1.lastPlayed), s1.lastPlayed);
    ok('the save stamps the v9 schema version', s1.version === 9, s1.version);
    fake += 60000;                       // a minute passes
    mainMod.autosave('exit');
    const s2 = stored();
    ok('the timestamp MOVES between saves (the silent-failure trap)',
      s2.lastPlayed > s1.lastPlayed, { first: s1.lastPlayed, second: s2.lastPlayed });
    ok('nothing else was demoted by the saves (gold + purchase survive)',
      s2.gold === 512 && s2.purchased.dmg === 2, { gold: s2.gold, dmg: s2.purchased.dmg });
  } finally { Date.now = realNow; }
}

// ---- 2. THE MIGRATION: v8 -> v9 is lossless, both fields null ---------------
{
  const meta = await import('../src/meta.js');
  const fakeStorage = { _m: new Map([['hordes_profile_v1', JSON.stringify(OLD_SAVE)]]),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
  const res = meta.loadProfileResult(fakeStorage);
  ok('the v8 save migrated (status migrated, v8->v9 step ran)',
    res.status === 'migrated' && res.migrations.includes(8), { status: res.status, migrations: res.migrations });
  ok('lastPlayed migrates to null (no timestamp is INVENTED for an old save)',
    res.profile.lastPlayed === null, res.profile.lastPlayed);
  ok('lastSeenUpdate migrates to null (nothing marked seen)',
    res.profile.lastSeenUpdate === null, res.profile.lastSeenUpdate);
  ok('the migration is LOSSLESS: gold, purchases, unlocks, runs all survive',
    res.profile.gold === 512 && res.profile.purchased.dmg === 2 &&
    res.profile.unlockedWeapons.includes('BOOMERANG') &&
    (res.profile.achievements.totals.runs || 0) === 7,
    { gold: res.profile.gold, dmg: res.profile.purchased.dmg, runs: res.profile.achievements.totals.runs });
  // Garbage stamps repair to null and NAME the field (validateProfile path).
  const bad = { ...OLD_SAVE, version: 9, lastPlayed: 'yesterday', lastSeenUpdate: 42 };
  const badStore = { _m: new Map([['hordes_profile_v1', JSON.stringify(bad)]]),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
  const rb = meta.loadProfileResult(badStore);
  ok('garbage lastPlayed/lastSeenUpdate repair to null and are REPORTED',
    rb.status === 'repaired' && rb.repairs.includes('lastPlayed') && rb.repairs.includes('lastSeenUpdate') &&
    rb.profile.lastPlayed === null && rb.profile.lastSeenUpdate === null,
    { status: rb.status, repairs: rb.repairs });
  const good = { ...OLD_SAVE, version: 9, lastPlayed: 1893456000000, lastSeenUpdate: 'x' };
  const goodStore = { _m: new Map([['hordes_profile_v1', JSON.stringify(good)]]),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
  const rg = meta.loadProfileResult(goodStore);
  ok('a valid stamp passes through untouched (no repair)',
    rg.status === 'current' && rg.profile.lastPlayed === 1893456000000 && rg.profile.lastSeenUpdate === 'x',
    { status: rg.status });
}

// ---- 3. THE GATE: every due/not-due edge, on the PURE function --------------
{
  const rel = W.release;
  ok('the release constant is marked worth-telling and carries an id + a date',
    rel.worthTelling === true && typeof rel.id === 'string' && rel.id.length > 0 &&
    typeof rel.dateMs === 'number' && rel.dateMs > 0, { id: rel.id, dateMs: rel.dateMs });
  ok('the copy is plain ASCII with no emojis (house UI rule)',
    [rel.title, ...rel.lines].every(s => !/[^\x00-\x7F]/.test(s)));
  ok('the copy is a short list phrased as what the player GETS',
    rel.lines.length >= 3 && rel.lines.length <= 6 && rel.lines.every(l => l.length > 0 && l.length <= 90),
    rel.lines.map(l => l.length));
  const P = (over) => ({ lastPlayed: rel.dateMs - 1000, lastSeenUpdate: null, ...over });
  ok('DUE: an existing save that predates the release (the returning player)',
    W.due(P(), rel, false) === true);
  ok('DUE: a MISSING timestamp (an older, pre-v9 save) counts as not-seen',
    W.due(P({ lastPlayed: null }), rel, false) === true);
  ok('NOT DUE: an active player (lastPlayed after the ship date)',
    W.due(P({ lastPlayed: rel.dateMs + 1 }), rel, false) === false);
  ok('NOT DUE: already dismissed THIS release (shown once, across reloads)',
    W.due(P({ lastSeenUpdate: rel.id }), rel, false) === false);
  ok('NOT DUE: a brand-new profile — the PROLOGUE owns the first-run intro',
    W.due(P({ lastPlayed: null }), rel, true) === false);
  ok('NOT DUE: an UNMARKED release (worthTelling false pops nothing)',
    W.due(P(), { ...rel, worthTelling: false }, false) === false);
}

// ---- 4. THE SHOW: launch-only paper note on the REAL title, dismiss persists -
{
  // Boot state: the profile's lastPlayed is still the migrated null (the
  // saves in section 1 stamped the STORE, and getProfile() reads the live
  // object — reset it to the pre-v9 arm so the launch gate reads "not seen").
  T.getProfile().lastPlayed = null;
  T.getProfile().lastSeenUpdate = null;
  W.tried = false;
  T.showTitle();
  const note = noteEl();
  ok('the paper note rides the REAL title card list (first card, parchment class)',
    !!note && cards()[0] === note, { first: cards()[0] && cards()[0].className, n: cards().length });
  ok('the title is still fully playable under it (START GAME card present)',
    cards().some(el => /START GAME/.test(el.innerHTML || '')));
  ok('the note carries the release copy and a dismiss affordance',
    /WHAT'S NEW/.test(note.innerHTML) && /tap anywhere else to close/i.test(note.innerHTML));
  // DISMISS: persists lastSeenUpdate; the title stays whole. The persisted
  // BYTES must actually change on the dismiss (addendum 2026-09-17: "dismissing
  // the popup should write a save" — the same prove-it-moved discipline the
  // timestamp gets, or a player who closes the tab sees it again).
  const rawBefore = ls.get('hordes_profile_v1');
  note.click();
  ok('the dismiss removed the note and PERSISTED lastSeenUpdate (shown once)',
    !noteEl() && stored().lastSeenUpdate === W.release.id,
    { seen: stored().lastSeenUpdate });
  ok('the dismiss WROTE THE SAVE immediately (the persisted bytes changed on the tap)',
    ls.get('hordes_profile_v1') !== rawBefore && JSON.parse(ls.get('hordes_profile_v1')).lastSeenUpdate === W.release.id);
  ok('after the dismiss the title is unchanged and playable',
    st.mode === 'title' && cards().some(el => /START GAME/.test(el.innerHTML || '')));
  // A later title return never re-adds it (launch-only + seen).
  T.showTitle();
  ok('a second title entry does not re-add the note', !noteEl());
  // And a reload-equivalent (fresh module state, seen release) stays quiet:
  W.tried = false;
  T.showTitle();
  ok('even with the launch flag reset, a dismissed release stays dismissed',
    !noteEl() && T.getProfile().lastSeenUpdate === W.release.id);
  W.tried = true;   // hygiene for anything after this block
}

// ---- 5. LAUNCH-ONLY: an undismissed note does not haunt later title returns -
{
  T.getProfile().lastPlayed = null;
  T.getProfile().lastSeenUpdate = null;
  W.tried = false;
  T.showTitle();
  ok('fixture: the note is up (undismissed)', !!noteEl());
  // Player ignores it and navigates: the next title return (same page load)
  // does not stack a second note.
  T.showTitle();
  ok('no second note stacks on a later title return', cards().filter(el => String(el.className).includes('paper-note')).length <= 1);
  // Clean up: dismiss so the module state ends tidy.
  const n = noteEl(); if (n) n.click();
}

// ---- 6. NOT FOR A FRESH PROFILE: the prologue precedence rule ---------------
{
  // The rule, pinned end to end: a fresh boot (no save at all) never sees the
  // note — the first-run PROLOGUE is that player's intro. The pure gate said
  // so in section 3; here the REAL title path agrees for a save-less boot.
  const rel = W.release;
  const freshProfile = { lastPlayed: null, lastSeenUpdate: null };
  ok('fresh boot + fresh profile: no note, by the same gate the title reads',
    W.due(freshProfile, rel, true) === false);
  ok('returning boot + migrated save: the note (the arm this file tested in 4)',
    W.due({ lastPlayed: null, lastSeenUpdate: null }, rel, false) === true);
}

// ---- 7. ADDENDUM: the OPT-IN guided run (the offer, decline, accept, B6) ----
{
  const rel = W.release;
  const prof = T.getProfile();

  // DECLINING (the dismiss) = normal play: nothing automatic EVER happens to a
  // returning player — the previous auto-arm is gone.
  prof.lastPlayed = null; prof.lastSeenUpdate = null;
  T.startRun();
  ok('DECLINED/undismissed: startRun opens a NORMAL run (no prologue, nothing automatic)',
    T.prologue.active === false && st.prologue === null && st.mode === 'playing',
    { prologue: st.prologue, mode: st.mode });
  ok('no run is flagged ASSISTED without the opt-in', st.assistedRun === false);
  // (end that run's state: back to title for the offer leg)
  T.showTitle();

  // THE OFFER: the note carries the accept affordance (the real browser wires
  // the .offer button; the seam drives the same acceptWhatsNew function).
  prof.lastPlayed = null; prof.lastSeenUpdate = null;
  W.tried = false;
  T.showTitle();
  const note = noteEl();
  ok('fixture: the note is up with the offer copy in it',
    !!note && /SHOW ME/.test(note.innerHTML) && /tap anywhere else to close/i.test(note.innerHTML));
  ok('the note copy names the guided run and the potion (what the player GETS)',
    rel.lines.some(l => /guided run/i.test(l)) && rel.lines.some(l => /potion/i.test(l)));

  // DECLINE through the real card tap: marks the release seen, normal play.
  const rawBefore = ls.get('hordes_profile_v1');
  note.click();
  ok('DECLINE: the tap dismissed the note, marked the release seen, WROTE the save',
    !noteEl() && stored().lastSeenUpdate === rel.id && ls.get('hordes_profile_v1') !== rawBefore);
  T.startRun();
  ok('DECLINE leads to normal play: the next run has NO prologue and NO assist flag',
    T.prologue.active === false && st.assistedRun === false && st.mode === 'playing');
  T.showTitle();

  // ACCEPT: starts the guided run NOW, flagged ASSISTED.
  prof.lastPlayed = null; prof.lastSeenUpdate = null;
  W.tried = false;
  T.showTitle();
  ok('fixture: the note is up for the accept', !!noteEl());
  W.accept(noteEl());
  ok('ACCEPT starts the guided run immediately: prologue armed, potion on screen, run live',
    T.prologue.active === true && !!T.prologue.potion && st.mode === 'playing');
  ok('the accepted run is flagged ASSISTED (B6: the run-scoped stamp)',
    st.assistedRun === true);
  ok('ACCEPT marks the release seen + writes the save (the ask happened ONCE)',
    prof.lastSeenUpdate === rel.id && stored().lastSeenUpdate === rel.id);
  ok('the note is gone after the accept', !noteEl());

  // THE APPROVED SKIP, from THIS entry point: stop explaining, keep the potion.
  T.prologue.skip();
  ok('skip from the accepted run: explaining stops, the phase STAYS armed (skipped mode)',
    T.prologue.active === true && st.prologue.skipped === true &&
    st.prologue.revealed.move === true && T.prologue.buttonsLocked === false);
  T.prologue.drink();
  ok('the post-skip drink pays the shield and ends the phase (skip keeps the potion)',
    T.prologue.active === false && T.prologue.shieldT > 0 && st.mode === 'playing',
    { active: T.prologue.active, shieldT: T.prologue.shieldT, mode: st.mode });

  // The offer is asked once per marked release: a later launch never re-offers.
  W.tried = false;
  T.showTitle();
  ok('the offer is asked ONCE per marked release (seen id: no note on later launches)',
    !noteEl());

  // ONCE: the opt-in is consumed by the arm — the next run is normal.
  T.startRun();
  ok('the guided run happens once per opt-in: the next startRun is a normal run',
    T.prologue.active === false && st.assistedRun === false);
  T.showTitle();

  // THE DECLINED OFFER IS NOT LOST: REPLAY TOUR re-arms the same opt-in.
  W.arm();
  T.startRun();
  ok('REPLAY TOUR (the seam it calls) re-arms the guided run for the next START GAME',
    T.prologue.active === true && st.assistedRun === true);
  T.prologue.drink();                            // end the phase; leave state tidy
  ok('cleanup: the phase ended and the run is live', T.prologue.active === false && st.mode === 'playing');

  // B6 OPTION (b): an ASSISTED summary keeps FULL gold + counters but writes
  // NO best-run record — and the end screen carries the flag.
  const ach = await import('../src/achievements.js');
  const mkProf = () => ({ purchased: {}, unlockedWeapons: [], unlockedElites: [],
    achievements: { totals: {}, earned: {}, progress: {}, timed: {} } });
  const p1 = mkProf();
  ach.recordRun(p1, { kills: 500, gold: 900, wave: 40, time: 600, weaponLevel: 9, assisted: true });
  ok('an ASSISTED run writes NO best-run record (bestWave/bestTime/bestWeapon/bestGold all unset)',
    p1.achievements.totals.bestWave === undefined && p1.achievements.totals.bestTime === undefined &&
    p1.achievements.totals.bestWeaponLevel === undefined && p1.achievements.totals.bestGold === undefined,
    p1.achievements.totals);
  ok('an ASSISTED run keeps FULL gold + the cumulative counters (kills, gold, runs)',
    p1.achievements.totals.gold === 900 && p1.achievements.totals.kills === 500 &&
    p1.achievements.totals.runs === 1, p1.achievements.totals);
  ok('a normal run still writes the records',
    (ach.recordRun(p1, { kills: 1, gold: 10, wave: 5, time: 60 }), p1.achievements.totals.bestWave === 5));
  st.assistedRun = true;
  ok('the end screen flags the run ASSISTED (the B6 tag rides the end card)',
    /ASSISTED/.test(T.endScreenBody({ lead: 'RUN OVER', gold: 10 })));
  st.assistedRun = false;
  ok('a normal end screen carries no ASSISTED tag',
    !/ASSISTED/.test(T.endScreenBody({ lead: 'RUN OVER', gold: 10 })));
}

console.log('test_whatsnew: all ' + passed + ' checks passed');
