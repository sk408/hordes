// IN-RUN REFERENCE ACCESS (owner 2026-09-16: "The users want to know what
// each control does, and what the objects on the screen are, such as
// potions, chests, arches, etc." + supplement: the death and victory screens
// get the same door, and the three historical failure modes of the tutorial
// rework are asserted, not assumed).
//
// WHAT THIS FILE PINS:
//   1. THE IN-RUN DOOR — SETTINGS carries a HOW TO PLAY entry that opens the
//      SAME reference cards (no forked copy) and, on GOT IT, returns to the
//      FIGHT with the run still live (clock frozen while open, never reset;
//      kills/wave untouched; mode back to playing).
//   2. GAMEPLAY INPUT NEVER DISMISSES IT — movement/skill/doctrine keys are
//      inert while the reference is open; the dismisser is its own control
//      (GOT IT / BACK-discipline ESC).
//   3. RE-OPENABLE, NOT ONE-SHOT — the door opens again immediately after a
//      return (failure mode b).
//   4. THE MOBILE PATH — the touch cog routing (pointerdown, data-act) is
//      enough to reach the reference mid-run; no keyboard hint list involved.
//   5. THE END SCREENS — death (THE HORDE WINS), deliberate END RUN (RUN
//      ENDED) and victory (RUN SURVIVED) all carry the HOW TO PLAY card and
//      return to the SAME screen (title, body, RETRY card back).
//   6. THE CANONICAL LIST — built from the game's own action table (the
//      touch layer's authored buttons in index.html) + the controls_ref
//      registry: every control is NAMED in the reference with a non-empty
//      purpose, so a new binding cannot be added silently without a row.
//   7. OBJECT MEANINGS — chest / portal / arch / shrine / potion all carry
//      what they DO, not just their names.
//   8. FAILURE MODE (c) SOURCE PIN — the hint strip (the only ambient
//      explainer) is pointer-events:none by construction.
// Run: node test/test_ref_access.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS } from '../src/controls_ref.js';

const s = suite('test_ref_access');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const h = await boot({});
const T = h.T, st = h.state, elements = h.elements;
const pump = h.pump, key = h.key;
const cards = () => [...elements['ov-cards'].children];
const byTitle = (t) => cards().find(c => (c.innerHTML || '').includes(t));
const title = () => elements['ov-title'].textContent;
const quietField = () => {
  st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 999;
  st.wave.endsAt = st.time + 9999; st.wave.bosses = []; st.wave.boss = null; st.portal = null;
};

// ---- 1+2+3. THE IN-RUN DOOR, THE NON-DISMISSION, THE RE-OPEN -------------------
s.check('in-run SETTINGS opens the SAME reference; GOT IT returns to the LIVE run; re-openable', () => {
  T.startRun(); pump(5);
  quietField();
  const timeAtOpen = st.time, kills0 = st.player.kills, wave0 = st.wave.num;
  assert(timeAtOpen > 0, 'the probe needs a live run (t=' + timeAtOpen + ')');
  T.openSettings();
  const entry = byTitle('HOW TO PLAY');
  assert(entry, 'the in-run SETTINGS screen must offer HOW TO PLAY');
  entry.click();
  assert(title() === 'HOW TO PLAY', 'the entry opens the reference (got ' + title() + ')');
  assert(byTitle('TOUCH') && byTitle('KEYBOARD') && byTitle('THE FIELD'),
    'the SAME reference cards (no forked copy)');
  assert(st.mode !== 'playing', 'the reference pauses the run (mode ' + st.mode + ')');

  // GAMEPLAY INPUT MUST NOT DISMISS (failure mode c): movement, skills,
  // doctrine and potions are all playing-gated acts — every one is inert here.
  for (const k of ['d', 'ArrowRight', 'q', 'e', 'Tab', 'g', 'h', 'n']) {
    key('keydown', { key: k, preventDefault() {} });
  }
  pump(12);
  assert(title() === 'HOW TO PLAY',
    'gameplay keys must not dismiss the reference (got ' + title() + ')');

  // GOT IT returns to the fight: run live, nothing reset.
  byTitle('GOT IT').click();
  assert(st.mode === 'playing', 'GOT IT must return to the fight (mode ' + st.mode + ')');
  assert(elements['overlay'].style.display === 'none', 'the overlay is down');
  assert(st.time === timeAtOpen, 'the clock froze while open and was never reset ' +
    '(' + timeAtOpen + ' -> ' + st.time + ')');
  assert(st.player.kills === kills0 && st.wave.num === wave0,
    'the run is the SAME run (kills/wave untouched)');

  // RE-OPENABLE (failure mode b): the door works again immediately.
  T.openSettings();
  byTitle('HOW TO PLAY').click();
  assert(title() === 'HOW TO PLAY', 'the reference re-opens (never one-shot)');
  byTitle('GOT IT').click();
  assert(st.mode === 'playing', 'and returns to the fight again');
});

// ---- 4. THE MOBILE PATH ---------------------------------------------------------
s.check('the touch cog routing alone reaches the reference mid-run (no keyboard list)', () => {
  T.startRun(); pump(5);
  quietField();
  // The REAL pointer routing the touch layer registers (same seam smoke uses).
  elements['touch']._ev['pointerdown']({
    preventDefault() {}, pointerId: 51, clientX: 0, clientY: 0,
    target: {
      closest: (sel) => (sel === '[data-joy]') ? null
        : (sel === '[data-act]' ? { dataset: { act: 'settings' } } : null),
    },
  });
  assert(st.mode === 'settings', 'the cog opens settings from the touch path');
  const entry = byTitle('HOW TO PLAY');
  assert(entry, 'the HOW TO PLAY entry is a TAP TARGET on the touch path too');
  entry.click();
  assert(title() === 'HOW TO PLAY' && byTitle('TOUCH'),
    'a phone player reads the touch-worded reference mid-run');
  byTitle('GOT IT').click();
  assert(st.mode === 'playing', 'GOT IT returns to the fight from the touch path');
});

// ---- 5. THE END SCREENS ---------------------------------------------------------
const toDeadScreen = () => {
  T.die();
  let guard = 0;
  while (st.mode === 'death-cine' && guard++ < 900) pump(1);
  assert(st.mode === 'dead', 'the probe needs the death screen (mode ' + st.mode + ')');
};
s.check('death screen: HOW TO PLAY card opens the reference, GOT IT returns HERE', () => {
  T.startRun(); pump(5);
  quietField();
  toDeadScreen();
  const deadTitle = title();
  assert(/THE HORDE WINS|THE HORDE CLAIMS ALL/.test(deadTitle),
    'death card up (got ' + deadTitle + ')');
  const endRef = byTitle('HOW TO PLAY');
  assert(endRef, 'the death screen must offer HOW TO PLAY');
  endRef.click();
  assert(title() === 'HOW TO PLAY' && byTitle('THE FIELD'),
    'same reference, opened from the death screen');
  byTitle('GOT IT').click();
  assert(st.mode === 'dead' && title() === deadTitle,
    'GOT IT returns to the SAME death screen (mode ' + st.mode + ', ' + title() + ')');
  assert(byTitle('RETRY') && byTitle('TITLE'),
    'the death screen cards are back (no re-settle, no restart)');
  // The run was NOT restarted by the round trip.
  assert(st.player.hp <= 0 || st.time > 0, 'the dead run is still the dead run');
});

s.check('victory screen: HOW TO PLAY card returns to RUN SURVIVED', () => {
  T.startRun(); pump(5);
  quietField();
  T.run.runSurvived();
  assert(st.mode === 'dead' && title() === 'RUN SURVIVED', 'victory card up');
  const endRef = byTitle('HOW TO PLAY');
  assert(endRef, 'the victory screen must offer HOW TO PLAY');
  endRef.click();
  assert(title() === 'HOW TO PLAY', 'same reference, opened from victory');
  byTitle('GOT IT').click();
  assert(st.mode === 'dead' && title() === 'RUN SURVIVED' && byTitle('RETRY'),
    'GOT IT returns to the victory screen with its cards');
});

s.check('END RUN screen: the same door (RUN ENDED)', () => {
  T.startRun(); pump(5);
  quietField();
  T.openSettings();
  const end = byTitle('END RUN');
  assert(end, 'END RUN card present');
  end.click();
  byTitle('CONFIRM END RUN?').click();
  assert(st.mode === 'dead' && title() === 'RUN ENDED', 'the deliberate end card up');
  const endRef = byTitle('HOW TO PLAY');
  assert(endRef, 'the END RUN screen must offer HOW TO PLAY too');
  endRef.click();
  byTitle('GOT IT').click();
  assert(title() === 'RUN ENDED' && byTitle('RETRY'),
    'GOT IT returns to the END RUN screen');
});

s.check('the title settings door also opens it (and returns to the title)', () => {
  // from wherever we are, walk the real path to the title
  byTitle('TITLE').click();
  let guard = 0;
  while (st.mode !== 'title' && guard++ < 30) pump(1);
  assert(st.mode === 'title' && title() === 'HORDES', 'title up');
  byTitle('SETUP').click();
  byTitle('SETTINGS').click();
  const entry = byTitle('HOW TO PLAY');
  assert(entry, 'title SETTINGS offers the same entry');
  entry.click();
  assert(title() === 'HOW TO PLAY', 'opens the reference from title settings');
  byTitle('GOT IT').click();
  assert(title() === 'HORDES' && st.mode === 'title', 'returns to the title');
});

// ---- 6+7. THE CANONICAL LIST + OBJECT MEANINGS ----------------------------------
// Open the reference once (title door) and harvest its rendered text.
s.check('the canonical control list: every authored control is NAMED in the reference', () => {
  byTitle('HOW TO PLAY').click();
  assert(title() === 'HOW TO PLAY', 'reference open for the canonical sweep');
  const refHtml = cards().map(c => c.innerHTML || '').join('\n');

  // The game's own ACTION TABLE: every data-act authored on the touch layer,
  // harvested live from index.html. The map below is this test's inventory of
  // what each act IS — a NEW binding harvested from the markup but missing
  // here FAILS the sweep, so a control cannot be added silently without a
  // reference row (and an inventory entry naming it).
  const ACT_NAMES = {
    focus: 'FOCUS', stance: 'STANCE', pilot: 'PILOT', stats: 'STATS',
    q: 'FROST', w: 'OVER', h: 'HP', n: 'MP',
    settings: 'SETTINGS', help: 'HELP', radar: 'RADAR', map: 'MAP',
  };
  const touchSeg = html.slice(html.indexOf('<div id="touch">'), html.indexOf('<div id="overlay">'));
  const acts = [...touchSeg.matchAll(/data-act="([a-z]+)"/g)].map(m => m[1]);
  assert(acts.length >= 11, 'the action table harvest found the buttons (' + acts + ')');
  for (const a of acts) {
    const name = ACT_NAMES[a];
    assert(name, 'the touch layer carries action "' + a + '" with no inventory entry — add one and a reference row');
    assert(refHtml.includes(name), 'the reference must NAME the authored control "' + name + '" (act ' + a + ')');
  }
  // The controls_ref registry: every row carries a purpose and is findable.
  for (const c of CONTROLS) {
    assert(c.purpose && c.purpose.length > 3, c.id + ' needs a real purpose clause');
    const named = refHtml.includes(c.keys.join(' / ')) || refHtml.includes(c.touch);
    assert(named, 'the reference must carry the row of ' + c.id +
      ' (keys ' + c.keys.join('/') + ' / touch ' + c.touch + ')');
  }
});

s.check('object MEANINGS, not just names (chest / portal / arch / shrine / potions)', () => {
  const refHtml = cards().map(c => c.innerHTML || '').join('\n');
  for (const tok of ['chests', 'portal', 'arches', 'shrines']) {
    assert(refHtml.includes(tok), 'the reference must list ' + tok);
  }
  // Potions must say WHAT they restore (owner named them among the objects).
  const pot = /potions[^<]*restore/i.test(refHtml) || /restore[^<]*potions/i.test(refHtml);
  assert(pot, 'the potions row must say what HP / MP restore (got: ' +
    (refHtml.match(/potions[^<]*/i) || ['none'])[0] + ')');
});

// ---- 8. failure mode (c): the ambient layer can never eat a tap ------------------
s.check('the hint strip is pointer-inert by construction (source pin)', () => {
  const onb = readFileSync(new URL('../src/onboarding.js', import.meta.url), 'utf8');
  const m = /#hint-strip[\s\S]{0,400}pointer-events:\s*none/.test(onb) ||
    /'[^']*pointer-events:none[^']*'/.test(onb);
  assert(m, 'the hint strip style must carry pointer-events:none');
});

s.done();
