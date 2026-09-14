// HORDES — SKILL-BUTTON KEY LETTERS (playtest: "put a [Q] and [E] by the
// timer").
//
// The obvious slot for the letter — the badge under the label — is already the
// LIVE cooldown readout (RDY / LOW / 8.0s, written every frame by
// updateTouchHud). So the letters go INLINE ahead of the label and the badge
// keeps its job. This file pins that arrangement:
//   1. every skill button carries its key letter AND its cooldown badge;
//   2. the two are SIBLINGS (the badge's textContent write must not be able to
//      clobber the letter, and the letter must not be able to clobber the
//      readout);
//   3. the badge still receives the live readout through the real frame loop;
//   4. the rest of the UI agrees: the hint lines and the opt-in text HUD name
//      the same two letters, and `E` is the one that works in BOTH pilot modes.
// The real-browser/layout half of this evidence lives in
// tools/verify_skill_keys.mjs (measured on a 390x844 coarse-pointer Chrome).
// Run: node test/test_skill_key_letters.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';

const ROOT = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', ROOT), 'utf8');

// ---- MARKUP: read straight out of index.html --------------------------------
const btnHtml = (act) => {
  const i = html.indexOf('<button data-act="' + act + '">');
  assert.ok(i >= 0, 'index.html must carry the ' + act + ' button');
  return html.slice(i, html.indexOf('</button>', i));
};
// The hint copy is BUILT in main.js (applyHints overwrites the static markup),
// so the source of truth is the HINT_LINES table there.
const mainSrc = fs.readFileSync(new URL('src/main.js', ROOT), 'utf8');
const hintBlock = () => {
  const i = mainSrc.indexOf('const HINT_LINES = {');
  assert.ok(i >= 0, 'HINT_LINES must exist in main.js');
  return mainSrc.slice(i, mainSrc.indexOf('\n};', i));
};

// ---- LIVE: one boot, all the frame driving done up front (the suite's check()
// helper is synchronous, so every check below reads already-collected state).
const h = await boot();
const st = h.state;
const T = h.T;
const keepAlive = () => { st.player.hp = st.player.stats.maxHp; };

T.startRun();
T.hudText.set(true);
h.pump(2, keepAlive);
const badgeAtRest = h.elements['tc-q'].textContent;
const overBadgeAtRest = h.elements['tc-w'].textContent;

const p = st.player;
p.mana = p.stats.maxMana;
// RETARGET (N1 slice 3): the default run's Q is the Knight's EARTHSHATTER —
// kill-charged, NON-mana — so the badge's live readout is the CHARGE pair at
// rest and the cooldown countdown after a real cast. The fixture banks the
// charge through the published kills field, then presses Q: the cast fires
// through the same useSkill seam and the badge must count down exactly like
// the old mana-Q did.
p.kills = C.SKILLS.EARTHSHATTER.KILLS;
h.key('keydown', { key: 'q' });
h.pump(2, keepAlive);
const badgeAfterUse = h.elements['tc-q'].textContent;
const hudLine = (h.elements['hud'].textContent || '').split('\n').find(l => /^Q /.test(l)) || '';

const S = suite('SKILL KEY LETTERS');

// ============================================================================
S.check('each skill button carries its key letter', () => {
  for (const [act, want] of [['q', 'Q'], ['w', 'E']]) {
    const b = btnHtml(act);
    assert.ok(new RegExp('<span class="key">\\[' + want + '\\]</span>').test(b),
      act + ' button must carry a boxed [' + want + '] key span: ' + b);
    // It sits AHEAD of the label (inside the button, on the label's line).
    assert.ok(b.indexOf('class="key"') < b.indexOf('>FROST') ||
      b.indexOf('class="key"') < b.indexOf('>OVER'),
      act + ' key must precede the skill label: ' + b);
  }
});

S.check('each skill button KEEPS its live cooldown badge, as a sibling', () => {
  for (const act of ['q', 'w']) {
    const b = btnHtml(act);
    assert.ok(new RegExp('<span class="badge" id="tc-' + act + '">RDY</span>').test(b),
      act + ' button must still carry its badge slot with the shipped RDY seed: ' + b);
    // Siblings, not nested: the badge's textContent write replaces its own
    // children, so a key INSIDE the badge would be erased on the first frame.
    const keyEnd = b.indexOf('</span>', b.indexOf('class="key"'));
    const badgeAt = b.indexOf('class="badge"');
    assert.ok(keyEnd < badgeAt, act + ' key and badge must be siblings (key first): ' + b);
  }
  // The pixel-art styling for the new span exists (an unstyled span would be a
  // bare glyph at the default size on the label's line).
  assert.ok(/#touch button \.key \{/.test(html), 'the .key span must be styled');
  const css = html.slice(html.indexOf('#touch button .key {'));
  assert.ok(/font-size: 10px/.test(css.slice(0, 400)),
    'the key must be sized down so it reads as a key cap, not as the skill name');
});

// ============================================================================
S.check('the badge still takes the LIVE readout through the real frame loop', () => {
  // N1 slice 3: an ult's readiness readout is the CHARGE pair (`0/40`) in
  // place of RDY/LOW — still never a key letter.
  assert.ok(badgeAtRest === 'RDY' || badgeAtRest === 'LOW' || /^\d+\/\d+$/.test(badgeAtRest),
    'at rest the badge prints the readiness readout, not a key letter (got ' +
    JSON.stringify(badgeAtRest) + ')');
  assert.match(badgeAfterUse, /^\d+\.\d+s$/,
    'using the Q skill must put a live countdown in the badge (got ' +
    JSON.stringify(badgeAfterUse) + ')');
  assert.ok(overBadgeAtRest === 'LOW' || overBadgeAtRest === 'RDY' ||
    /^\d+\.\d+s$/.test(overBadgeAtRest),
    'the OVER badge must print its own readout (got ' + JSON.stringify(overBadgeAtRest) + ')');
  assert.ok(!/[QEW]/.test(overBadgeAtRest),
    'no key letter may appear in a badge readout (got ' + JSON.stringify(overBadgeAtRest) + ')');
});

// ============================================================================
S.check('the hint lines and the text HUD name the SAME two letters', () => {
  // E is the overcharge key in BOTH pilot modes; W is AUTO-only (held 'up' in
  // MANUAL). The buttons advertise the universal pair, so the rest must too.
  assert.equal(C.SKILLS.FROST_NOVA.KEY, 'q', 'FROST_NOVA is Q');
  const hints = hintBlock();
  // (h) INVARIANT: every mode the player can be in must have its OWN entry and
  // must name ITSELF. The pre-(h) table had only AUTO + MANUAL, so AUTO_MOVE fell
  // through to the AUTO copy and the panel named the wrong mode.
  for (const mode of ['AUTO_ALL', 'AUTO_MOVE', 'MANUAL']) {
    assert.match(hints, new RegExp('\\b' + mode + ':'),
      `${mode} must have its OWN hint entry (a fallback names the wrong mode)`);
  }
  assert.match(hints, /M pilot \(AUTO ALL\)/, 'the AUTO ALL line names its own mode');
  assert.match(hints, /M pilot \(AUTO MOVE\)/, 'the AUTO MOVE line names its own mode');
  assert.match(hints, /M pilot \(MANUAL\)/, 'the MANUAL line names its own mode');
  assert.match(hints, /Q \/ E/, 'the AUTO hint line must teach Q / E');
  assert.match(hints, /\(W too\)/, 'the AUTO hint line still discloses W');
  assert.match(hints, /Q frost &middot; E overcharge/,
    'the MANUAL hint line must teach Q frost / E overcharge');
});

S.check('the canvas text HUD prints E for OVERCHARGE, not the AUTO-only W', () => {
  // RETARGET (N1 slice 3): the Q line names the class ult's short LABEL
  // (EARTH on the default Knight run) instead of FrostNova.
  assert.match(hudLine, /Q EARTH/, 'the HUD names the Q skill: ' + hudLine);
  assert.match(hudLine, /E Ovrchg/, 'the HUD names the E skill: ' + hudLine);
  assert.ok(!/W Ovrchg/.test(hudLine),
    'the HUD must not advertise the AUTO-only W as the overcharge key: ' + hudLine);
});

S.done();
