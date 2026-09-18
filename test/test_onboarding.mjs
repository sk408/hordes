// ONBOARDING RETIREMENT (owner 2026-09-18) — the whole in-run hint layer is
// DELETED: src/onboarding.js (HintStrip / makeHintStore / HINT_IDS /
// GIVE_UP_RUNS / HINT_FADE_S / layoutStrip) is gone from the tree, and
// main.js carries no scheduler (maybeHint / pumpHints / updateOnboarding /
// HINT_SPACING_S / hintsSuppressed / controlUsed / resetOnboarding /
// bossFightLive / introSawDraft / introSawIntermission). The owner's
// tutorial principle: "a tutorial should happen mostly prior to full
// gameplay" — the manual (HOW TO PLAY) and the first-run prologue carry the
// teaching now; the four KEPT coach cards (draft / death / settings /
// loadout) are untouched.
//
// This file pins the retirement the way test_notags.mjs pinned the
// object-tags removal:
//   1. SOURCE: src/onboarding.js does not exist; no src module imports it;
//      main.js has no hint-scheduler code (usage-shaped pins — the
//      retirement comment in main.js names the old symbols as history,
//      which is provenance, not code);
//   2. RUNTIME: a REAL run driven end to end — play, wave boss KILL,
//      portal, intermission, CONTINUE, death, RETURN TO TITLE — mounts no
//      element with id 'hint-strip' on ANY frame (the old layer mounted its
//      first hint inside ~1s of run start; this assertion was RED against
//      it);
//   3. THE KEPT COACHES STILL WORK: the draft coach mounts its tour root on
//      the first draft and SKIP (the real Escape path) ends it — the
//      retirement took the hint layer, not the coach layer.
// Run: node test/test_onboarding.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const s = suite('test_onboarding');
const SRC = new URL('../src/', import.meta.url);
const MAIN = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

// ---- 1. SOURCE: the layer is gone, not flagged off ------------------------------
s.check('src/onboarding.js does not exist (deleted, not flagged off)', () => {
  assert.equal(existsSync(new URL('../src/onboarding.js', import.meta.url)), false,
    'src/onboarding.js is still on disk');
});
s.check('no src module imports the retired engine', () => {
  const walk = function* (dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = dir + '/' + e.name;
      if (e.isDirectory()) yield* walk(p);
      else if (e.name.endsWith('.js')) yield p;
    }
  };
  for (const f of walk(SRC.pathname)) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\bfrom\s+['"][^'"]*\bonboarding\.js['"]/.test(src),
      f + ' still imports onboarding.js');
  }
});
s.check('main.js carries no hint-scheduler code (the retirement comment names history; the CODE is gone)', () => {
  // Usage-shaped pins: the retired identifiers as CALLS / DEFINITIONS /
  // STATE. (main.js:5353+ keeps a retirement comment naming maybeHint /
  // pumpHints / HINT_SPACING_S / updateOnboarding as history — a bare
  // substring pin would match provenance, so these match live code only.)
  for (const [label, re] of [
    ['maybeHint(', /\bmaybeHint\s*\(/],
    ['pumpHints(', /\bpumpHints\s*\(/],
    ['updateOnboarding(', /\bupdateOnboarding\s*\(/],
    ['new HintStrip', /\bnew\s+HintStrip\b/],
    ['makeHintStore(', /\bmakeHintStore\s*\(/],
    ['layoutStrip(', /\blayoutStrip\s*\(/],
    ['HINT_SPACING_S definition', /\bHINT_SPACING_S\s*=/],
    ['hintsSuppressed', /\bhintsSuppressed\b/],
    ['hintStore', /\bhintStore\b/],
    ['controlUsed(', /\bcontrolUsed\s*\(/],
    ['resetOnboarding', /\bresetOnboarding\b/],
    ['bossFightLive(', /\bbossFightLive\s*\(/],
    ['introSawDraft', /\bintroSawDraft\b/],
    ['introSawIntermission', /\bintroSawIntermission\b/],
    ['HINT_IDS', /\bHINT_IDS\b/],
    ['GIVE_UP_RUNS', /\bGIVE_UP_RUNS\b/],
    ['HINT_FADE_S', /\bHINT_FADE_S\b/],
  ]) {
    assert.ok(!re.test(MAIN), 'main.js still carries ' + label);
  }
});
s.check('no hint-strip surface can be built: no hint-strip id/cssText, no hordes_hint_* keys in main.js', () => {
  assert.ok(!MAIN.includes("'hint-strip'") && !MAIN.includes('"hint-strip"') &&
    !MAIN.includes('#hint-strip'), 'main.js still builds the hint-strip element');
  assert.ok(!/hordes_hint_[a-z]/.test(MAIN),
    'main.js still reads/writes a hordes_hint_* storage key');
});
s.check('the __TEST onboarding seam exposes ONLY the touch-path read (no store/scheduler left)', () => {
  const seam = MAIN.slice(MAIN.indexOf('onboarding: {'));
  assert.ok(seam.indexOf('touchPath') >= 0 && seam.indexOf('touchPath') < 200,
    'the touchPath read survives (the prologue tooltips use it)');
  for (const dead of ['store', 'pending', 'spacing', 'suppressed', 'replayRearm']) {
    assert.ok(!new RegExp('\\b' + dead + '\\b').test(seam.slice(0, 220)),
      'the onboarding seam still exposes ' + dead);
  }
});

// ---- 2. RUNTIME: a full run cycle mounts NO hint strip, ever ---------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, elements = h.elements, pump = h.pump, key = h.key;
const body = globalThis.document.body;
const stripEls = () => (body.children || []).filter(c => c && c.id === 'hint-strip');
let stripFrames = 0;   // frames on which ANY hint-strip element was mounted
let stripSaw = null;   // first mounted text, for the failure message

T.banners.suppressAll();   // frame-counting probe: no one-time banner holds

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    pump(1);
    st.bannerHold = 0;   // the token-banner fixture (test_prologue precedent)
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = (elements['ov-cards'].children || [])[0];
      if (c0 && c0.click) c0.click();
    }
    const els = stripEls();
    if (els.length) { stripFrames += els.length; if (!stripSaw) stripSaw = els[0].textContent; }
  }
}
// Pump until pred, resolving overlays the way a player would; every frame is
// still scanned for hint strips. Returns true when pred fired.
function stepUntil(pred, capSeconds) {
  for (let i = 0, n = Math.round(capSeconds * 60); i < n; i++) {
    step(1);
    if (st.mode === 'portal-cine') { key('keydown', { key: 'x', preventDefault() {} }); }
    if (pred()) return true;
  }
  return false;
}

const t0run = () => {
  T.startRun();
  step(2);
  T.setPilotMode('MANUAL');
  st.player.stats.xpMult = 0;                       // no drafts mid-leg
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;  // nothing ends the leg early
};

// The OLD trigger surface, all live at once (the retired layer's own
// conditions: potions carried with HP dropped, skills ready with combat
// live, a portal open, a crowd on and off the view, chests on the field):
t0run();
st.player.potions.hp = 2; st.player.potions.mp = 2;
st.player.hp = st.player.stats.maxHp * 0.5;
st.player.mana = st.player.stats.maxMana;
for (let i = 0; i < 8; i++) {
  st.enemies.push({ typeId: 'CHASER', x: st.player.x + 60 + i * 30, y: st.player.y,
    w: 10, hp: 1e6, maxHp: 1e6, speed: 0, mx: 0, my: 0, age: 0, elite: false });
}
st.enemies.push({ typeId: 'CHASER', x: st.player.x + 5000, y: st.player.y,
  w: 10, hp: 1e6, maxHp: 1e6, speed: 0, mx: 0, my: 0, age: 0, elite: false });   // off-view
st.chests.push({ x: st.player.x - 4000, y: st.player.y, age: 0 });               // off-view
step(60 * 8);
s.check('plain play with every old hint trigger live mounts NO hint strip (8s)', () => {
  assert.equal(stripFrames, 0, stripFrames + ' hint-strip frames (first: ' + stripSaw + ')');
  assert.ok(st.time > 6, 'the sim really ran (t=' + st.time.toFixed(1) + ')');
});

// BOSS KILL -> PORTAL -> INTERMISSION (the real path: spawnBoss at the wave
// end, the kill funnel's pendingClear, the walk-in, the skippable cine).
// wave.num = 2: the wave-1 portal enters the ESCAPE instead of the plain
// intermission — this leg wants the ordinary ladder.
{
  st.wave.num = 2;
  st.wave.midAt = st.time + 1e9; st.wave.midBossDone = true;
  st.wave.endsAt = st.time;   // the wave ends NOW: spawnBoss fires next tick
  const sawBoss = stepUntil(() => !!st.wave.boss, 5);
  s.check('the wave boss spawned through the real scheduler', () => {
    assert.ok(sawBoss, 'no wave boss within 5s of endsAt');
  });
  // Leave the parked trigger crowd in place (harmless — speed 0): the boss
  // object lives IN st.enemies, so clearing the array here would exempt it
  // from the reap pass that opens the portal.
  st.wave.boss.hp = 0;        // the kill: the reap sets pendingClear + portal coords
  const opened = stepUntil(() => !!st.portal, 5);
  s.check('the boss kill opened the portal (pendingClear -> portal, real path)', () => {
    assert.ok(opened, 'no portal within 5s of the boss dying');
  });
  st.portal.x = st.player.x + 5; st.portal.y = st.player.y;   // walk-in range
  const inter = stepUntil(() => st.mode === 'intermission', 8);
  s.check('boss kill -> portal -> intermission (the full earned beat)', () => {
    assert.ok(inter, 'intermission not reached (mode ' + st.mode + ')');
  });
  const cont = (elements['ov-cards'].children || []).find(c => (c.innerHTML || '').includes('CONTINUE'));
  s.check('the intermission offers CONTINUE', () => assert.ok(cont, 'no CONTINUE card'));
  cont.click();
  step(60 * 2);
  s.check('CONTINUE resumed the run, still strip-free', () => {
    assert.equal(st.mode, 'playing', st.mode);
    assert.equal(stripFrames, 0, stripFrames + ' hint-strip frames (first: ' + stripSaw + ')');
  });
}

// DEATH -> death screen -> RETURN TO TITLE.
{
  T.die();
  step(5);
  if (st.mode === 'death-cine') key('keydown', { key: 'x', preventDefault() {} });
  step(10);
  s.check('the run ended on the death screen', () => {
    assert.equal(st.mode, 'dead', st.mode);
  });
  step(60 * 3);   // park on the death screen — nothing fades in late
  key('keydown', { key: 't', preventDefault() {} });
  step(5);
  s.check('RETURN TO TITLE after death, still strip-free', () => {
    assert.equal(st.mode, 'title', st.mode);
  });
}
s.check('no element with id hint-strip mounted on ANY frame of the whole cycle', () => {
  assert.equal(stripFrames, 0, stripFrames + ' hint-strip frames (first text: ' + stripSaw + ')');
});

// ---- 3. THE KEPT COACHES STILL WORK ----------------------------------------------
// The retirement took the hint layer, NOT the coach cards. Force the draft
// coach through the REAL first-draft path (flag cleared -> openDraft) and
// end it through the REAL Escape path (the Tour's own document keydown —
// captured here because the harness document stub does not record listener
// registrations).
{
  h.storage.delete(TOUR_KEYS.draft);   // a player who has not seen the draft card
  const docKeys = [];
  const prevAdd = globalThis.document.addEventListener;
  globalThis.document.addEventListener = (ev, cb) => { if (ev === 'keydown') docKeys.push(cb); };
  try {
    T.startRun();
    step(2);
    T.setPilotMode('MANUAL');   // suspends the auto-pick: the coach owns the screen
    st.player.stats.xpMult = 0;
    st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
    st.pendingDrafts = 1;
    T.openDraft();
    // Pump WITHOUT the auto-pick step(): the coach is the thing under test —
    // it suspends the AUTO countdown, so nothing resolves the draft but us.
    const coachStep = (n) => { for (let i = 0; i < n; i++) { pump(1); stripFrames += stripEls().length; } };
    coachStep(2);
    const tourRoot = () => (body.children || []).find(c => c && c.id === 'tour-root') || null;
    s.check('the draft coach mounts its tour root on the first draft', () => {
      assert.equal(st.mode, 'draft', st.mode);
      assert.ok(tourRoot(), 'no tour-root after the first draft opened');
    });
    s.check('the coach names THE DRAFT', () => {
      const tip = (tourRoot().children || []).find(c => c && c.id === 'tour-tip');
      assert.ok(tip && (tip.innerHTML || '').includes('THE DRAFT'),
        'tip: ' + (tip && tip.innerHTML));
    });
    for (const cb of docKeys.slice()) cb({ key: 'Escape', preventDefault() {} });   // SKIP
    s.check('SKIP (Escape) ends the coach — the tour root is gone', () => {
      assert.ok(!tourRoot(), 'the tour root survived Escape');
    });
    s.check('the skip toasted the replay pointer', () => {
      assert.ok((st.toasts || []).some(t => /TOUR SKIPPED/.test(t.msg)),
        'toasts: ' + JSON.stringify((st.toasts || []).map(t => t.msg)));
    });
    const c0 = (elements['ov-cards'].children || [])[0];
    if (c0 && c0.click) c0.click();
    s.check('the draft resolves under the dismissed coach (run continues)', () => {
      assert.equal(st.mode, 'playing', st.mode);
    });
    s.check('... and the coach never mounted a hint strip either', () => {
      assert.equal(stripFrames, 0, stripFrames + ' hint-strip frames');
    });
  } finally {
    globalThis.document.addEventListener = prevAdd;
  }
}

s.done();
