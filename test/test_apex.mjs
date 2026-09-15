// HORDES — G25 SLICE 1: THE APEX TIER (run-side behaviour).
// Run: node test/test_apex.mjs
//
// What this file pins, per docs/briefs/G25_APEX_TIER.md:
//   1. the ONE re-arm seam — weapons.js rateScale returns 0 while the run's
//      apexFire stamp is live, so ASCENDANT ARSENAL never stops firing; OFF
//      (or not owned) restores the EXACT pre-apex mapped cooldown;
//   2. a measured 10s window: fire counts on vs off + the wall-clock cost of
//      the boosted window (the frame budget must hold);
//   3. startRun stamps the run-scoped apex state from the profile accessors,
//      so a menu-screen toggle never rewrites a live run;
//   4. THE MARK OF THE GRIND is proof-only: the HUD flourish and the run-end
//      APEX clause are asserted by STRING equality — a run with apex OFF
//      renders byte-identically to the pre-apex output, not "close enough".
//
// The gate/pricing/partition/save-schema contracts live in test_meta.mjs and
// test_save.mjs; the shop-panel DOM is exercised by tools/verify_g25_apex.mjs.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { WEAPON_TYPES, WEAPONS } from '../src/weapons.js';
import { CONFIG as C } from '../src/config.js';
import { setApexEnabled } from '../src/meta.js';

const S = suite('G25 apex tier');
const { T, state, elements, key } = await boot({
  storage: [['hordes_onboarded', '1']],
});

// ---- 1. the re-arm seam: EXACT numbers, re-derived independently -----------
// A minimal but REAL weapons.js state: the BEAM archetype (one clean shot, a
// `fires` counter the update path itself increments) against a dummy enemy.
function apexReadyState(apexFire) {
  return {
    apexFire,
    player: {
      x: 240, y: 150, mana: 999, hp: 100, buffs: {},
      stats: {
        cooldown: C.WEAPON.COOLDOWN,   // the stock pace => mapped rate 1.0
        damage: 10, projectiles: 1, pierce: 0, crit: 0,
      },
    },
    enemies: [{ x: 300, y: 150, hp: 1e12, flash: 0 }],
    projectiles: [],
    effects: [],
  };
}
const DT = 1 / 60;
const beam = () => ({ type: 'BEAM', level: 1, xp: 0, cd: 0, angle: 0, ticks: new Map(), payload: { blades: [] } });

// The PRE-SLICE mapped cooldown, re-derived from the config constants the
// way rateScale computed it before G25 (no apex field involved at all):
//   (stats.cooldown / WEAPON.COOLDOWN) * overcharge(1) / rateMult(1) * evo(1)
const preSliceScale = (C.WEAPON.COOLDOWN / C.WEAPON.COOLDOWN) * 1 / 1;
const preSliceCd = WEAPONS.BEAM.COOLDOWN * preSliceScale;

S.check('apex OFF (or absent): the re-arm writes the EXACT pre-slice cooldown', () => {
  for (const apexFire of [false, undefined]) {
    const st = apexReadyState(apexFire);
    const w = beam();
    WEAPON_TYPES.BEAM.update(st, w, DT);
    assert.equal(w.fires, 1, 'the first update fires (cd starts at 0)');
    assert.equal(w.cd, preSliceCd,
      `apexFire=${apexFire}: re-arm = ${w.cd}, pre-slice mapped value = ${preSliceCd}`);
  }
});

S.check('apex ON: the seam returns 0 — the weapon fires EVERY frame', () => {
  const st = apexReadyState(true);
  const w = beam();
  WEAPON_TYPES.BEAM.update(st, w, DT);
  assert.equal(w.cd, 0, 'the re-arm writes zero cooldown');
  WEAPON_TYPES.BEAM.update(st, w, DT);
  assert.equal(w.fires, 2, 'the very next frame fires again');
  assert.equal(w.cd, 0, 'still zero — never re-arms while the stamp is live');
});

S.check('toggling the stamp OFF restores the exact pre-slice value', () => {
  const st = apexReadyState(true);
  const w = beam();
  WEAPON_TYPES.BEAM.update(st, w, DT);            // fires at 0 cd, re-arms 0
  st.apexFire = false;                           // the run-scoped stamp flips
  WEAPON_TYPES.BEAM.update(st, w, DT);            // cd is 0 -> fires once more
  assert.equal(w.cd, preSliceCd, 'the next re-arm is the exact pre-slice number');
});

// ---- 2. the measured 10s window: fire counts + frame budget ----------------
S.check('10s window: apex ON fires ~600x vs ~3x OFF, and the budget holds', () => {
  const WINDOW = 10;                              // seconds of simulated time
  const FRAMES = Math.round(WINDOW / DT);
  const run = (apexFire) => {
    const st = apexReadyState(apexFire);
    const w = beam();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < FRAMES; i++) WEAPON_TYPES.BEAM.update(st, w, DT);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { fires: w.fires, ms, effects: st.effects.length };
  };
  const off = run(false), on = run(true);
  console.log(`    10s window @60fps: OFF fired ${off.fires}x (${off.ms.toFixed(1)}ms wall), ` +
    `ON fired ${on.fires}x (${on.ms.toFixed(1)}ms wall, ${on.effects} effects pushed)`);
  assert.equal(off.fires, Math.floor(WINDOW / WEAPONS.BEAM.COOLDOWN) + 1,
    `OFF fires once per cooldown (${off.fires}x over 10s)`);
  assert.equal(on.fires, FRAMES, `ON fires once per frame (${on.fires}x = every frame of ${FRAMES})`);
  assert.ok(on.fires > off.fires * 100, 'the rule-breaker is not a tune-up: >100x the fire rate');
  // Frame budget: the boosted window's wall-clock cost stays trivially inside
  // a frame (16.7ms EACH at 60fps — the whole 600-frame window must cost less
  // than a single frame's budget, or the game could not keep up).
  assert.ok(on.ms < 16.7,
    `600 boosted updates cost ${on.ms.toFixed(1)}ms total (< one 60fps frame budget)`);
  assert.ok(on.ms < Math.max(off.ms * 20, 5),
    `the boosted window is not orders of magnitude dearer (${on.ms.toFixed(1)}ms vs ${off.ms.toFixed(1)}ms)`);
});

// ---- 3. startRun stamps: the profile drives the run, the menu never does ---
S.check('startRun stamps apex state from the profile accessors', () => {
  const profile = T.getProfile();
  // Fresh: gate closed, toggle off.
  T.startRun();
  assert.equal(state.apexRun, false, 'fresh profile: apexRun false');
  assert.equal(state.apexFire, false, 'fresh profile: apexFire false');
  assert.equal(state.apexMark, false, 'fresh profile: apexMark false');
  // Owned + toggled ON: the next run carries all three stamps.
  profile.apex.owned.push('apex_mark', 'apex_endless_fire');
  setApexEnabled(profile, true);
  T.startRun();
  assert.equal(state.apexRun && state.apexFire && state.apexMark, true,
    'owned + ON: run/fire/mark stamps all live');
  // Toggle OFF in the menu: the NEXT run is clean again (ownership persists).
  setApexEnabled(profile, false);
  T.startRun();
  assert.equal(state.apexRun || state.apexFire || state.apexMark, false,
    'toggled OFF: every stamp is false even with items owned');
  // Owned but only the proof item: no fire stamp (THE MARK has no power).
  setApexEnabled(profile, true);
  profile.apex.owned = ['apex_mark'];
  T.startRun();
  assert.equal(state.apexMark, true, 'the mark stamp rides the proof item');
  assert.equal(state.apexFire, false, 'the mark grants NO power (no fire stamp)');
  setApexEnabled(profile, false);
  profile.apex.owned = [];
  T.startRun();
});

// ---- 4. byte-identity: the HUD flourish + the run-end APEX clause ----------
const hud = () => T.hudTextBlock(state.player);

S.check('a live run with apex OFF renders the HUD byte-identically (string equality)', () => {
  T.startRun();
  const off = hud();
  state.apexMark = false;
  assert.equal(hud(), off, 'an explicit false stamp changes nothing');
  delete state.apexMark;                 // the PRE-SLICE shape: no field at all
  assert.equal(hud(), off, 'the absent (pre-slice) field renders identically');
  assert.ok(!off.includes('APEX'), 'the OFF HUD contains no APEX text');
});

S.check('the flourish is exactly ONE inserted line, nothing else moves', () => {
  state.apexMark = true;
  const on = hud();
  state.apexMark = false;
  const off = hud();
  assert.ok(on.includes('APEX MARK OF THE GRIND\n'), 'the ON HUD carries the flourish line');
  assert.equal(on.split('APEX MARK OF THE GRIND\n').join(''), off,
    'removing the inserted line yields the OFF output byte-for-byte');
});

S.check('the run-end body: apex OFF is byte-identical, ON adds exactly the APEX clause', () => {
  const args = { lead: 'YOU DIED', cause: 'A BRUTE', gold: 1234, firstClear: false };
  state.apexRun = false;
  const off = T.endScreenBody({ ...args });
  delete state.apexRun;
  assert.equal(T.endScreenBody({ ...args }), off, 'the absent (pre-slice) field renders identically');
  assert.ok(!off.includes('APEX'), 'the OFF body contains no APEX text');
  state.apexRun = true;
  const on = T.endScreenBody({ ...args });
  state.apexRun = false;
  assert.equal(on, '<span class="cause">APEX RUN</span><br>' + off,
    'the ON body is the OFF body with EXACTLY the APEX clause prepended');
  // The clause rides the SAME mark pattern the challenge/stage clauses use:
  // it stacks with them rather than replacing them.
  state.challenge = 'ONE_WEAPON';        // a real non-standard id the table knows
  state.apexRun = true;
  try {
    const both = T.endScreenBody({ ...args });
    assert.ok(both.includes('APEX RUN</span><br><span class="cause">'),
      'the apex clause stacks directly onto a challenge clause');
  } finally {
    state.challenge = 'STANDARD';
    state.apexRun = false;
  }
});

S.done();

// ============================================================================
// G25 SLICE 2 — THE APEX GALLERY (mode 'apex', the reused G9 showcase).
// The art-format contract lives in test_art_lint.mjs; the REAL-browser proof
// lives in tools/verify_g25_apex_gallery.mjs. This section pins the SCREEN
// contract in the harness: the gate keeps the screen unreachable, the ring
// walks the catalogue, the shared trophyView seam is honest on every exit
// path, and the clean clear stays byte-identical.
let asyncPassed = 0;
async function acheck(label, fn) {
  try { await fn(); asyncPassed++; console.log('  ok - ' + label); }
  catch (err) { console.error('  FAIL - ' + label + '\n' + (err && err.stack || err)); process.exitCode = 1; }
}
const keyEv = (k) => ({ key: k, repeat: false, preventDefault() {} });
const cardNames = () => (elements['ov-cards'].children || [])
  .map(c => (c._html || '').replace(/<[^>]*>/g, ' '));

// The profile this harness booted with is FRESH: the gate is closed, so the
// gate-closed contract is checked FIRST, then the profile is upgraded in
// place through the REAL buyers (the same fixture discipline as the verify
// tool) for the gate-open contract.
const meta = await import('../src/meta.js');
function completeTheCatalogue(p) {
  p.gold = 1e12;
  for (const def of meta.SHOP_UPGRADES) {
    let guard = 0;
    while (!meta.shopRowOwned(p, def) && meta.buyUpgrade(p, def.id)) {
      if (++guard > 100) throw new Error('runaway buy loop on ' + def.id);
    }
  }
  if (!meta.apexUnlocked(p)) throw new Error('fixture gate not open');
}

await acheck('gate closed: the gallery is UNREACHABLE — no card, no key, no direct call', () => {
  const before = { mode: state.mode, view: state.trophyView };
  // No path renders a GALLERY (or any apex) card while the gate is closed.
  meta.SHOP_UPGRADES && T.openTrophies();          // title -> trophies is fine
  T.closeTrophies();
  // The direct call must no-op on a locked profile (stale-handler proof).
  T.openApexGallery();
  if (state.mode === 'apex') throw new Error('openApexGallery opened on a LOCKED profile');
  if (state.trophyView !== null) throw new Error('trophyView set on a LOCKED profile');
  // Keys in the meta screens never enter the mode.
  for (const mode of ['menu']) {
    for (const k of ['Escape', 'ArrowLeft', 'ArrowRight']) {
      if (state.mode === 'apex') throw new Error('entered apex from ' + mode + ' via ' + k);
      key('keydown', keyEv(k));
    }
  }
  if (state.mode === 'apex') throw new Error('a key entered the apex gallery while locked');
  if (state.trophyView !== before.view) throw new Error('a key mutated trophyView while locked');
});

await acheck('gate closed: the shop DOM has NO apex path at all (title -> shop walk)', () => {
  // Drive the REAL screens the player taps: title -> SHOP, then read the card
  // list. With the gate closed there is no APEX row (slice 1) and therefore no
  // GALLERY card either — the tier cannot even be LISTED early.
  T.title.replay();                               // the real title screen
  const shopCard = (elements['ov-cards'].children || [])
    .find(c => String(c._html || '').includes('>SHOP<'));
  assert.ok(shopCard, 'the title renders a SHOP card');
  shopCard.click();
  const names = (elements['ov-cards'].children || [])
    .map(c => String(c._html || '').replace(/<[^>]*>/g, ''));
  assert.ok(!names.some(t => /APEX|GALLERY/.test(t)),
    'no APEX row and no GALLERY card while the gate is closed');
  key('keydown', keyEv('Escape'));                 // shop -> title
});

await acheck('gate open + apex unowned: the title and trophy gallery stay byte-identical', () => {
  completeTheCatalogue(T.getProfile());
  assert.equal(meta.apexUnlocked(T.getProfile()), true, 'fixture upgraded');
  assert.equal(T.getProfile().apex.owned.length, 0, 'and owns NO apex item');
  // The TITLE card list never mentions apex (the only door is inside the
  // gated apex panel, which itself lives behind the shop's gated APEX row).
  T.title.replay();
  const titleCards = (elements['ov-cards'].children || [])
    .map(c => String(c._html || ''));
  assert.ok(!titleCards.some(t => /APEX|GALLERY/.test(t)),
    'the title screen carries no apex text');
  // The TROPHY GALLERY is untouched by the apex screen: its title is whatever
  // the PRE-SLICE logic renders (the ENTRY's name — this fixture has earned
  // no achievements, so the first entry reads LOCKED exactly as before this
  // slice), and its ring is the achievements' own.
  T.openTrophies();
  assert.equal(elements['ov-title'].textContent, 'LOCKED',
    'the trophy gallery title is the entry name (pre-slice behaviour)');
  const tv = state.trophyView;
  assert.ok(tv && tv.id !== 'apex_mark' && tv.id !== 'apex_endless_fire',
    'the trophy ring walks achievements, not apex');
  assert.ok(!String(elements['ov-sub']._html || '').includes('APEX'),
    'no APEX text in the trophy caption');
  T.closeTrophies();
  // The HUD and run-end strings are already pinned byte-identical by the
  // slice-1 checks above; nothing in this slice touches their builders.
});

await acheck('the gallery opens ONLY from the panel side of the gate: mode, title, payload', () => {
  // The player's real path: title -> SHOP -> APEX (the gated row) -> GALLERY.
  T.title.replay();
  const clickCard = (needle) => {
    const c = (elements['ov-cards'].children || [])
      .find(k => String(k._html || '').includes(needle));
    assert.ok(c, 'card containing "' + needle + '" is rendered');
    c.click();
  };
  clickCard('>SHOP<');
  clickCard('>APEX<');
  assert.equal(elements['ov-title'].textContent, 'APEX', 'the apex panel opened');
  clickCard('>GALLERY<');
  assert.equal(state.mode, 'apex', 'one activation on GALLERY opens the gallery');
  assert.equal(state.mode, 'apex', 'mode is apex');
  assert.equal(elements['ov-title'].textContent, 'APEX', 'title APEX');
  assert.ok(state.trophyView, 'trophyView (the REUSED G9 contract) is set');
  assert.equal(state.trophyView.id, 'apex_mark', 'ring starts at the catalogue head');
  assert.equal(state.trophyView.locked, true, 'unowned item is locked');
  assert.equal(state.trophyView.art.id, 'LOCKED', 'unowned art IS the shared LOCKED mask');
  const sub = String(elements['ov-sub']._html || '');
  assert.ok(sub.includes('LOCKED — 550000 gold'), 'the locked caption states the price');
  assert.ok(sub.includes('REMOVES:'), 'the one-line effect names the catalogue removes text');
});

await acheck('OWNED paints the item\'s OWN emblem with an OWNED caption', () => {
  assert.equal(meta.buyApex(T.getProfile(), 'apex_mark'), true, 'fixture buys the mark');
  T.openApexGallery();                            // re-open: the model re-reads ownership
  assert.equal(state.trophyView.art.id, 'apex_mark', 'owned art is the item\'s own emblem');
  assert.equal(state.trophyView.locked, false, 'owned entry is not locked');
  assert.ok(String(elements['ov-sub']._html || '').includes('OWNED'), 'caption states OWNED');
});

await acheck('PREV/NEXT walk the catalogue ring, wrapping at BOTH ends', () => {
  T.openApexGallery();                            // idx 0, apex_mark owned
  T.apexStep(1);
  assert.equal(state.trophyView.id, 'apex_endless_fire', 'NEXT steps onto item 2');
  assert.equal(state.trophyView.art.id, 'LOCKED', 'item 2 is unowned -> shared mask');
  T.apexStep(1);
  assert.equal(state.trophyView.id, 'apex_mark', 'NEXT past the end WRAPS to the head');
  T.apexStep(-1);
  assert.equal(state.trophyView.id, 'apex_endless_fire', 'PREV from the head wraps to the tail');
  assert.equal(state.trophyView.art.id, 'LOCKED', 'the wrapped tail is still masked');
});

await acheck('the showcase seam is HONEST: null on every exit path (BACK, ESC, panel re-entry)', () => {
  const stubCtx = { fillStyle: '', fillRect() {} };
  // ESC path
  T.openApexGallery();
  T.renderer.drawTrophyShowcase(stubCtx, state);
  assert.ok(T.renderer.trophyShowcase, 'the seam is populated while open');
  key('keydown', keyEv('Escape'));
  assert.equal(state.mode, 'menu', 'ESC left the gallery (panel return target)');
  assert.equal(state.trophyView, null, 'ESC nulled the shared trophyView');
  T.renderer.drawTrophyShowcase(stubCtx, state);
  assert.equal(T.renderer.trophyShowcase, null, 'the renderer seam is null after ESC');
  // BACK path (the card's onclick is what BACK runs)
  T.openApexGallery();
  T.closeApexGallery();
  assert.equal(state.trophyView, null, 'closeApexGallery (the BACK path) nulls the view');
  // panel re-entry then exit
  T.openApexGallery();
  T.closeApexGallery();
  T.openApexGallery();
  T.closeApexGallery();
  assert.equal(state.trophyView, null, 'null after re-entry and exit too');
  // The apex ring never repaints ANOTHER screen's caption (stale-handler rule)
  T.apexStep(1);
  assert.equal(state.trophyView, null, 'apexStep outside the gallery mutates nothing');
});

await acheck('the apex screen chrome is OFF (chromeOn allowlist: playing/finale only)', () => {
  T.openApexGallery();
  assert.equal(T.chromeOn(), false, 'the apex gallery is a meta screen: no pads, no hints');
  T.closeApexGallery();
  assert.equal(T.chromeOn(), false, 'still off after exit (title-side meta screen)');
});

console.log('G25 apex gallery: ' + asyncPassed + ' awaited seam checks passed');
