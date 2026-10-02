// THE FIRST MINUTE (M3): no manual stands between a new player and run 1.
// PLAY opens the pre-run screen, START begins the run, and the run itself
// teaches with three short cards (test_prologue.mjs). The manual stays
// available under SETTINGS, on the title and in the pause menu.
//
// This file pins:
//   1. NO GATE: on an empty profile, PLAY -> START reaches a live run without
//      the manual ever opening; Enter, Enter does the same from the keyboard.
//   2. THE MANUAL IS STILL THERE: title -> SETTINGS -> HOW TO PLAY opens the
//      four-page reference; GOT IT returns to the title.
//   3. SELF-EXPLAINING CONTROLS: every top-row button carries a readable NAME
//      (SETTINGS / HELP / RADAR / MAP); the desktop key bar names each key.
// Run: node test/test_upfront.mjs
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS } from '../src/controls_ref.js';

const s = suite('test_upfront');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const { T, state: st, elements, pump, key } = await boot({ prologue: true });   // an EMPTY profile, kept empty
const cards = () => [...elements['ov-cards'].children];
const byTitle = (t) => cards().find(c => (c.innerHTML || '').includes('>' + t + '<'));
const titleText = () => elements['ov-title'].textContent;
const kdown = (k) => key('keydown', { key: k, preventDefault() {} });
const toTitle = () => {
  T.die();
  for (let i = 0; i < 10 && st.mode !== 'dead' && st.mode !== 'death-cine'; i++) pump(1);
  if (st.mode === 'death-cine') kdown('x');
  for (let i = 0; i < 5; i++) pump(1);
  kdown('t');
  for (let i = 0; i < 5; i++) pump(1);
  if (st.mode !== 'title') throw new Error('not on the title (mode ' + st.mode + ')');
};

for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
s.check('an empty profile boots to the TITLE', () => {
  if (titleText() !== 'HORDES') throw new Error('ov-title is ' + titleText());
});

let manualSeen = false;
const watch = () => { if (titleText() === 'HOW TO PLAY' || st.manualPage) manualSeen = true; };
s.check('PLAY -> START on an empty profile reaches a live run with NO manual in between', () => {
  byTitle('PLAY').click(); watch();
  if (st.mode !== 'setup' || titleText() !== 'NEXT RUN') throw new Error('PLAY must open the pre-run screen (' + st.mode + ', ' + titleText() + ')');
  byTitle('START').click(); watch();
  for (let i = 0; i < 30 && st.mode !== 'playing'; i++) { pump(1); watch(); }
  if (st.mode !== 'playing') throw new Error('START never started the run (mode ' + st.mode + ')');
  if (manualSeen) throw new Error('the manual opened before run 1');
  if (elements['overlay'].style.display !== 'none') throw new Error('an overlay is still up over run 1');
});
s.check('run 1 is the tutorial run: its first card comes up, three cards in all', () => {
  if (!T.prologue.active) throw new Error('run 1 of an empty profile must open the tutorial');
  if (T.prologue.banners.length !== 3) throw new Error('the tutorial is ' + T.prologue.banners.length + ' cards, not 3');
  for (let i = 0; i < 60 && !T.prologue.paused; i++) pump(1);
  if (!T.prologue.paused || T.prologue.banner().action !== 'move') throw new Error('the MOVE card is not up');
});
s.check('the keyboard goes straight through: Enter (PLAY), Enter (START)', () => {
  toTitle();
  for (let i = 0; i < 60; i++) pump(1);   // the short return fade
  kdown('Enter');
  if (st.mode !== 'setup') throw new Error('Enter on the title must open the pre-run screen (mode ' + st.mode + ')');
  kdown('Enter');
  if (st.mode !== 'playing') throw new Error('Enter on the pre-run screen must start the run (mode ' + st.mode + ')');
  if (titleText() === 'HOW TO PLAY') throw new Error('the manual opened');
});

// ---- 2. the manual is still there ---------------------------------------------------
s.check('title -> SETTINGS -> HOW TO PLAY opens the reference; GOT IT returns to the title', () => {
  toTitle();
  if (byTitle('HOW TO PLAY')) throw new Error('HOW TO PLAY is not a title card any more');
  byTitle('SETTINGS').click();
  if (!byTitle('HOW TO PLAY')) throw new Error('SETTINGS lost HOW TO PLAY');
  byTitle('HOW TO PLAY').click();
  if (titleText() !== 'HOW TO PLAY') throw new Error('the reference did not open');
  let h = '';
  for (let p = 1; p <= 4; p++) { T.manual.goto(p); h += cards().map(c => c.innerHTML || '').join(''); }
  for (const t of ['>KEYBOARD CONTROLS<', '>TOUCH CONTROLS<', '>THE FIELD<', '>GOT IT<']) {
    if (!h.includes(t)) throw new Error('the manual lost ' + t);
  }
  // parity: every canonical row is in the manual (no forked copy).
  // (skill-q: a hero with an ULT gets its own Q line, built from the config.)
  const onComposite = new Set(['potion-hp', 'potion-mp', 'stats', 'skill-q']);
  for (const c of CONTROLS) {
    if (onComposite.has(c.id)) continue;
    if (!h.includes(c.purpose)) throw new Error('the manual lost the purpose of ' + c.id);
  }
  byTitle('GOT IT').click();
  for (let i = 0; i < 5; i++) pump(1);
  if (st.mode !== 'title') throw new Error('GOT IT must return to the title (mode ' + st.mode + ')');
});

// ---- 3. self-explaining controls -------------------------------------------------
s.check('every top-row button carries a readable NAME (SETTINGS / HELP / RADAR / MAP)', () => {
  const want = { 'tc-cog': 'SETTINGS', 'tc-help': 'HELP', 'tc-radar': 'RADAR', 'tc-map': 'MAP' };
  for (const [id, name] of Object.entries(want)) {
    const m = new RegExp('id="' + id + '"[^>]*>([^<]*(?:<span[^>]*></span>)?[^<]*)</button>').exec(html);
    if (!m) throw new Error(id + ' not found in index.html');
    const label = m[1].replace(/<[^>]*>/g, '').trim();
    if (label !== name) throw new Error(id + ' reads "' + label + '" not "' + name + '"');
  }
  if (!/cog-gear/.test(html)) throw new Error('the settings gear glyph was lost');
});
s.check('HP / MP / FROST / OVER keep their labels', () => {
  for (const tok of ['>HP<', '>MP<', 'FROST', 'OVER']) {
    if (!html.includes(tok)) throw new Error('lost ' + tok);
  }
});
s.check('the desktop key bar names a key for every action it carries', () => {
  const bar = /<div class="keybar" id="keybar">([\s\S]*?)<\/div>/.exec(html);
  if (!bar) throw new Error('no key bar in index.html');
  const acts = [...bar[1].matchAll(/<button data-act="([a-z]+)"[^>]*><b>([^<]+)<\/b>/g)].map(m => m[1] + ':' + m[2]);
  for (const need of ['pilot:O', 'q:Q', 'w:E', 'h:H', 'n:N', 'map:M', 'stats:I', 'settings:ESC', 'help:?']) {
    if (!acts.includes(need)) throw new Error('the key bar lost ' + need + ' (has ' + acts.join(', ') + ')');
  }
  if (!/<b>WASD<\/b>steer/.test(bar[1])) throw new Error('the key bar does not name the move keys');
});

s.done();
process.exit(0);
