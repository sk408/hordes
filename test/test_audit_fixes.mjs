// AUDIT FIX BUNDLE (2026-09-16) — one failing-first test per audit finding.
//   ITEM 1 (S1 serious): settlement is RUN-ONCE — a maw-then-death run pays
//     one award, folds lifetime totals once; a plain death settles exactly once.
//   ITEM 2 (S2 serious): a user gesture initializes/resumes audio (idempotent);
//     a suspended context self-heals on the next sound attempt (test_audio.mjs).
//   ITEM 3 (M1 minor): maw VICTORY restores the pre-boss stance; startRun
//     clears any carried preBossStance.
//   ITEM 4 (M2 minor): dying to the maw credits THE MAW; a stamped killer
//     never leaks into the next run.
//   ITEM 5 (M4 minor): intermission digit keys are one-press — auto-repeat
//     cannot re-fire the card (the paid-chest re-buy).
//   ITEM 6 (M5 hardening): NaN gold fails CLOSED at the purchase gates.
// Every check FAILS on the pre-fix tree (verified red before landing fixes).
// Run: node test/test_audit_fixes.mjs
import assert from 'node:assert/strict';
import { CONFIG as C } from '../src/config.js';
import { mulberry32 } from '../src/weather.js';
import { makeProfile, buyUpgrade, unlockWeapon } from '../src/meta.js';
import { AUDIO_TEST } from '../src/audio.js';
import { boot, suite } from './_harness.mjs';

// Deterministic arm (house pattern, test_run_structure.mjs): the maw drive is
// Math.random-charged; pin the module RNG so the drives below are reproducible.
Math.random = mulberry32(20260916);

const S = suite('AUDIT FIXES');

// ---------- ITEM 6 (M5): NaN gold fails CLOSED at the purchase gates --------
S.check('M5: NaN gold cannot buy upgrades or unlock weapons', () => {
  const prof = makeProfile();
  prof.gold = NaN;
  assert.equal(buyUpgrade(prof, 'dmg'), false, 'buyUpgrade must reject NaN gold');
  assert.equal(prof.purchased['dmg'], undefined, 'no upgrade level granted');
  assert.equal(unlockWeapon(prof, 'ORBIT'), false, 'unlockWeapon must reject NaN gold');
  assert.ok(!prof.unlockedWeapons.includes('ORBIT'), 'no weapon granted');
});

// ---------- ONE harness boot for the rest (house rule) ----------------------
const h = await boot();
const st = h.state;
const T = h.T;

const step = () => h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
const freezeSpawns = () => {
  st.spawnTimer = 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midAt = st.time + 1e9;
};
// The maw-drive machinery from test_run_structure.mjs PART B — the REAL loop,
// same paths: ladder to the milestone wave, slay the cast, enter the finale.
function driveToFinale() {
  freezeSpawns();
  st.wave.num = C.ESCALATION.END_WAVE;
  st.wave.endsAt = st.time;
  let guard = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && guard++ < 900) step();
  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  guard = 0;
  while (st.mode !== 'finale' && guard++ < 6000) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c = h.elements['ov-cards'].children[0];
      if (c) { c.click(); continue; }
    }
    step();
  }
  assert.equal(st.mode, 'finale', `reached the finale (mode=${st.mode})`);
}

// ---------- ITEM 5 (M4): digit auto-repeat cannot re-fire intermission cards -
S.check('M4: intermission digit keys are one-press (auto-repeat cannot re-buy)', () => {
  T.startRun(); h.pump(2);
  const card = { clicks: 0, click() { this.clicks++; } };
  h.elements['ov-cards'].children.push(card);
  st.mode = 'intermission';
  const key = (k, repeat) => h.key('keydown', { key: k, repeat, preventDefault() {} });
  key('1', false);   // an honest press takes the card
  assert.equal(card.clicks, 1, 'a genuine press clicks the card once');
  key('1', true);    // the OS auto-repeat tail
  assert.equal(card.clicks, 1, 'auto-repeat must NOT re-fire the card');
  key('1', false);   // a second HONEST press still works
  assert.equal(card.clicks, 2, 'a real second press still clicks');
  h.elements['ov-cards'].children.length = 0;
});

// ---------- ITEM 2 (S2): the user gesture initializes/resumes audio ---------
S.check('S2: a user gesture unlocks audio (one ctx, suspended gets resumed)', () => {
  // Inject the fake context into the SAME audio module main.js drives (ESM
  // singleton). At boot main.js's module-load init ran with no ctor, so the
  // first gesture is what constructs the context.
  const fake = {
    state: 'running', currentTime: 0, destination: {}, made: 0, resumes: 0,
    resume() { this.resumes++; return Promise.resolve(); },
    createGain() {
      return { gain: { value: 1, setValueAtTime() {} }, connect() { return null; } };
    },
    createOscillator() {
      return {
        type: 'sine', frequency: { value: 1, setValueAtTime() {},
          exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() { return null; }, start() {}, stop() {},
      };
    },
    createBufferSource() { return { connect() { return null; }, start() {}, stop() {}, buffer: null }; },
    createBuffer() { return { getChannelData: () => new Float32Array(1024) }; },
  };
  const ls = new Map();
  AUDIO_TEST.setDeps({
    AudioContext: function () { fake.made++; return fake; },
    storage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
  });
  h.key('keydown', { key: 'Shift' });          // any keydown is a gesture
  assert.equal(fake.made, 1, 'the first gesture initializes audio');
  fake.state = 'suspended';                    // the autoplay-policy state
  h.key('keydown', { key: 'Shift' });          // a later gesture while suspended
  assert.ok(fake.resumes >= 1, 'a suspended context is resumed on the gesture path');
  assert.equal(fake.made, 1, 'no second AudioContext is ever constructed');
  fake.state = 'running';
  h.key('keydown', { key: 'Shift' });
  assert.equal(fake.made, 1, 'still exactly one context (idempotent)');
  AUDIO_TEST.reset();   // drop the fake so later runs are audio-inert (no timers)
});

// ---------- ITEM 3a (M1): startRun clears a carried preBossStance -----------
S.check('M1: startRun clears a carried preBossStance (no cross-run stance leak)', () => {
  st.preBossStance = 'GREEDY';                 // what a mid-boss run-end leaves
  T.startRun(); h.pump(2);
  assert.equal(st.preBossStance, null, 'a fresh run starts with no carried boss-stance save');
});

// ---------- ITEMS 1 + 3b (S1, M1): the maw victory run ----------------------
S.check('S1+M1: maw VICTORY restores the stance and settles the run ONCE', () => {
  T.startRun(); h.pump(2);
  const stanceBefore = T.stanceOf();
  driveToFinale();
  assert.notEqual(st.preBossStance, null, 'the maw arrival saved the stance');
  // Slay it through the real loop (deterministic engagement, PART-B pattern).
  st.finalBoss.hp = 40;
  st.finalBoss.x = st.player.x + 40;
  st.finalBoss.y = st.player.y;
  let guard = 0;
  while (!st.mawCleared && guard++ < 1800) step();
  assert.equal(st.mawCleared, true, 'the maw was slain');
  // M1: VICTORY hands the doctrine back (withdrawal already did).
  assert.equal(st.preBossStance, null, 'maw VICTORY restores the stance');
  assert.equal(T.stanceOf(), stanceBefore, 'the pre-boss stance is live again');
  // S1: the milestone settle was the run's ONE settle. Continue, then die:
  // the later settle must pay NOTHING and fold NOTHING.
  const prof = T.getProfile();
  const gold0 = prof.gold;
  const kills0 = prof.achievements.totals.kills;
  const runs0 = prof.achievements.totals.runs;
  let cont = null;
  for (const c of h.elements['ov-cards'].children) {
    if ((c.innerHTML || '').includes('CONTINUE')) cont = c;
  }
  assert.ok(cont, 'the milestone hands off to the intermission');
  cont.click();
  freezeSpawns();
  T.die();                                     // the run's real ending
  const prof2 = T.getProfile();
  assert.equal(prof2.gold, gold0, 'the later death settles NOTHING more (award paid once)');
  assert.equal(prof2.achievements.totals.runs, runs0, 'the lifetime run fold happens exactly once');
  assert.equal(prof2.achievements.totals.kills, kills0, 'the lifetime kill fold happens exactly once');
});

// ---------- ITEM 1b (S1): a plain death settles exactly once ----------------
S.check('S1: a plain death still settles exactly once', () => {
  T.startRun(); h.pump(2); freezeSpawns();
  const gold0 = T.getProfile().gold;
  T.die();
  const gold1 = T.getProfile().gold;
  assert.ok(gold1 > gold0, 'the death settle pays');
  T.purse.settle();                            // a stray second settle
  assert.equal(T.getProfile().gold, gold1, 'no second payout (run-once)');
});

// ---------- ITEM 4b (M2): a maw death credits THE MAW -----------------------
S.check('M2: dying to the maw credits THE MAW on the death card', () => {
  T.startRun(); h.pump(2);
  driveToFinale();
  st.deathBy = null;
  st.player.hp = 1; st.player.invuln = 0;
  let guard = 0;
  while (st.mode !== 'death-cine' && st.mode !== 'dead' && guard++ < 600) {
    h.pump(1, () => {
      if (!st.finalBoss) return;
      st.player.x = st.finalBoss.x; st.player.y = st.finalBoss.y;
      st.player.invuln = 0; st.player.hp = 1;
    });
  }
  assert.ok(guard < 600, `the maw landed the killing blow (mode=${st.mode})`);
  assert.ok(st.deathBy, 'a death cause was recorded');
  assert.equal(st.deathBy.name, 'THE MAW', 'the death card credits the maw by name');
  assert.equal(st.deathBy.cause, 'contact', 'stamped as the maw contact');
});

// ---------- ITEM 4a (M2): a stamped killer never leaks into the next run ----
S.check('M2: a stamped killer never leaks into the NEXT run', () => {
  T.startRun(); h.pump(2);
  // Die to a real contact hit — the audit's stale seed (it stamps the killer).
  let guard = 0;
  while (!(st.enemies || []).length && guard++ < 600) h.pump(1);
  assert.ok(st.enemies.length > 0, 'an enemy is on the field');
  st.enemies[0].x = st.player.x; st.enemies[0].y = st.player.y;
  st.player.invuln = 0; st.player.hp = 1;
  h.pump(2);
  assert.ok(st.mode === 'death-cine' || st.mode === 'dead', `the contact killed the hero (mode=${st.mode})`);
  assert.equal(st.deathBy.cause, 'contact', 'the killer was stamped this run');
  // The next run has taken no damage: an immediate death must read UNKNOWN,
  // not the previous run's attacker.
  T.startRun(); h.pump(2);
  T.die();
  assert.equal(st.deathBy.cause, 'unknown', 'no stale killer from the previous run');
});

S.done();
