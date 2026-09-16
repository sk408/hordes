// HOW TO PLAY — MOBILE READABILITY (owner 2026-09-16: "We need to fix the
// formatting of the how to play screen, at least on mobile. It's hard to read
// the text because of the narrow width and it wraps").
//
// The reference screen is a DOCUMENT, not a tip. This file pins the STRUCTURE
// that makes it readable (the wide-panel modifier, the two-column rows, the
// internally scrolling body, the always-reachable GOT IT) plus the CSS source
// that sizes it. The GEOMETRY itself (>=85% width, no horizontal overflow,
// nothing clipped, tokens never split) is measured in a REAL browser by
// tools/verify_help_mobile.mjs at 360 / 390 / 430 and the 480x300 embed —
// a stub DOM cannot lay text out, and a source pin alone cannot prove a
// player can read the panel.
//
// What must NOT change: the KEPT coachmark cards keep the compact #tour-tip
// box (they are 1-2 lines), and every other menu keeps the plain .card.
// Run: node test/test_help_mobile.mjs
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS } from '../src/controls_ref.js';

const s = suite('test_help_mobile');
const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Fresh profile: the first boot pops HOW TO PLAY right after the intro.
const { T, elements, pump } = await boot({});
let cards = () => [...elements['ov-cards'].children];
for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
s.check('fresh boot reaches the HOW TO PLAY screen', () => {
  if (elements['ov-title'].textContent !== 'HOW TO PLAY') {
    throw new Error('ov-title is ' + elements['ov-title'].textContent);
  }
});
const overlay = elements['overlay'];
const cardHtml = (t) => {
  const c = cards().find(k => (k.innerHTML || '').includes('>' + t + '<'));
  if (!c) throw new Error('no ' + t + ' card on the HOW TO PLAY screen');
  return { html: c.innerHTML, el: c };
};

// ---- 1. the wide-panel modifier is on THIS screen alone ------------------------
s.check('the HOW TO PLAY overlay carries the .howto wide-panel modifier', () => {
  if (!overlay.classList.contains('howto')) throw new Error('no howto class');
});
s.check('the three reference cards carry .ref (the readable panel)', () => {
  for (const t of ['TOUCH', 'KEYBOARD', 'THE FIELD']) {
    if (!cardHtml(t).el.classList.contains('ref')) throw new Error(t + ' is not .ref');
  }
});
s.check('the GOT IT control is the tall sticky .gotit card', () => {
  const g = cardHtml('GOT IT');
  if (!g.el.classList.contains('gotit')) throw new Error('GOT IT is not .gotit');
});
s.check('the modifier leaves with the screen (GOT IT -> title, no howto)', () => {
  cardHtml('GOT IT').el.click();
  if (overlay.classList.contains('howto')) throw new Error('howto survived into the title');
  // Re-open from the title card: same screen, same structure.
  const howTo = cards().find(k => (k.innerHTML || '').includes('>HOW TO PLAY<'));
  if (!howTo) throw new Error('no HOW TO PLAY card on the title');
  howTo.click();
  if (!overlay.classList.contains('howto')) throw new Error('re-open lost the modifier');
});

// ---- 2. two-column rows, built from the canonical control list -----------------
s.check('rows are TWO COLUMNS (.rr rows with a right-hand .rv trigger cell)', () => {
  const kb = cardHtml('KEYBOARD').html;
  if (!kb.includes('<div class="rr">')) throw new Error('no .rr row markup');
  if (!kb.includes('<span class="rv">')) throw new Error('no .rv value cell');
});
s.check('every canonical control is a KEYBOARD row: purpose left, keys right (controls_ref parity)', () => {
  const kb = cardHtml('KEYBOARD').html;
  // potions and the field report ride their pinned composite line below.
  const onComposite = new Set(['potion-hp', 'potion-mp', 'stats']);
  for (const c of CONTROLS) {
    if (onComposite.has(c.id)) continue;
    if (!kb.includes(c.purpose)) throw new Error('KEYBOARD lost the purpose of ' + c.id);
    if (!kb.includes('>' + c.keys.join(' / ') + '<')) throw new Error('KEYBOARD lost the key(s) of ' + c.id);
  }
});
s.check('the pinned composite lines survive whole (potions / stats / draft / pause copy)', () => {
  const kb = cardHtml('KEYBOARD').html;
  for (const needle of [
    'H / N — potions &middot; I — field report (the ONE stats key)',
    '1 – 3 — draft cards (1 – 4 in evolve / intermission)',
    'ESC or P — pause in a run',
  ]) {
    if (!kb.includes(needle)) throw new Error('lost pinned copy: ' + needle);
  }
});
s.check('the TOUCH card still names the touch surface (joystick / FOCUS / STANCE / cog)', () => {
  const tc = cardHtml('TOUCH').html;
  for (const tok of ['joystick', 'FOCUS', 'STANCE', 'cog']) {
    if (!tc.includes(tok)) throw new Error('TOUCH card lost ' + tok);
  }
});
s.check('THE FIELD still documents the objects (chests / portal / arches / shrines)', () => {
  const fd = cardHtml('THE FIELD').html;
  for (const tok of ['chests', 'portal', 'arches', 'shrines']) {
    if (!fd.includes(tok)) throw new Error('THE FIELD lost ' + tok);
  }
});

// ---- 3. the CSS that sizes the panel (source pins; geometry is the browser tool)
s.check('the wide panel exists: .ref spans the card row, capped at 560px', () => {
  const m = /#overlay\.howto \.card\.ref\s*\{([^}]*)\}/.exec(css);
  if (!m || !m[1].includes('width: 100%') || !m[1].includes('max-width: 560px')) {
    throw new Error('no wide .ref width rule');
  }
});
s.check('the panel body is readable and scrolls internally (15px, 1.5, overflow-y, max-height)', () => {
  const m = /#overlay\.howto \.card\.ref \.desc\s*\{([^}]*)\}/.exec(css);
  if (!m) throw new Error('no .ref .desc rule');
  for (const needle of ['font-size: 15px', 'line-height: 1.5', 'overflow-y: auto', 'max-height']) {
    if (!m[1].includes(needle)) throw new Error('.desc lost ' + needle);
  }
});
s.check('the trigger cell never splits a token (.rv white-space: nowrap)', () => {
  const m = /#overlay\.howto \.rv\s*\{([^}]*)\}/.exec(css);
  if (!m || !m[1].includes('white-space: nowrap')) throw new Error('no .rv nowrap rule');
});
s.check('rows are the two-column flex (label left, value right)', () => {
  const m = /#overlay\.howto \.rr\s*\{([^}]*)\}/.exec(css);
  if (!m || !m[1].includes('display: flex')) throw new Error('no .rr flex rule');
});
s.check('GOT IT is >=44px and stays pinned while the panel scrolls', () => {
  const m = /#overlay\.howto \.card\.gotit\s*\{([^}]*)\}/.exec(css);
  if (!m) throw new Error('no .gotit rule');
  for (const needle of ['min-height: 44px', 'position: sticky']) {
    if (!m[1].includes(needle)) throw new Error('.gotit lost ' + needle);
  }
});
s.check('the KEPT coachmark card keeps the compact box (#tour-tip max-width: 220px)', () => {
  const m = /#tour-tip\s*\{([^}]*)\}/.exec(css);
  if (!m || !m[1].includes('max-width: 220px')) throw new Error('the coachmark card was widened');
});
s.check('every other menu keeps the plain compact .card (no global .card widening)', () => {
  if (/#overlay\s+\.card\s*\{[^}]*min\(560px/.test(css)) throw new Error('a global .card wide rule leaked');
});

s.done();
