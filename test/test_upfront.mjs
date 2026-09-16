// UP-FRONT CONTROLS (owner 2026-09-16): "Wouldn't the buttons need to be
// explained right away? Otherwise we're back to throwing in with no context
// in a different way which is why the tutorial was built in the first
// place..people complained about not understanding".
//
// WHY THE RETIRED CARDS FAILED (and the fix must not repeat it): the 25-card
// tour INTERRUPTED the run — paused the sim mid-fight on a fixed timer.
// Explaining up front was never the objection; hijacking play was. So the
// gate explains BEFORE the run: on a fresh profile the FIRST START GAME
// shows the reference screen once, GOT IT starts the run. Never mid-run,
// never uninvited again.
//
// This file pins:
//   1. FIRST-RUN GATE: fresh boot -> TITLE (the WAVE-19 auto-pop moved to
//      the gate); START GAME -> the reference screen (TOUCH / KEYBOARD /
//      THE FIELD, one source of truth) with GOT IT; GOT IT sets the flag
//      and starts the run; the run clock advances; the gate never re-shows
//      unprompted; the title card keeps it re-openable.
//   2. THE GATE NEVER HIJACKS PLAY: it is a menu screen (the sim is not
//      live), no hint strip mounts under it, and dismissal is its own
//      control (GOT IT / ESC) — never a gameplay input.
//   3. SELF-EXPLAINING CONTROLS: every cog-row button carries a readable
//      NAME (SETTINGS / HELP / RADAR / MAP), not a bare glyph; HP / MP /
//      FROST / OVER keep their labels; ASCII only.
// The live-browser geometry of the named row (labels fit, nothing pushed
// off-screen) is measured by tools/verify_upfront.mjs.
// Run: node test/test_upfront.mjs
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS } from '../src/controls_ref.js';

const s = suite('test_upfront');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ---- 1. the first-run gate ------------------------------------------------------
const { T, state: st, elements, pump, key } = await boot({});   // FRESH profile
const cards = () => [...elements['ov-cards'].children];
const byTitle = (t) => cards().find(c => (c.innerHTML || '').includes('>' + t + '<'));
const stripEls = () => (globalThis.document.body.children || []).filter(c => c.id === 'hint-strip');

for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
s.check('fresh boot lands on the TITLE (the WAVE-19 auto-pop moved to the gate)', () => {
  if (elements['ov-title'].textContent !== 'HORDES') {
    throw new Error('ov-title is ' + elements['ov-title'].textContent);
  }
});

s.check('START GAME on a fresh profile shows the reference gate BEFORE the run', () => {
  byTitle('START GAME').click();
  if (elements['ov-title'].textContent !== 'HOW TO PLAY') {
    throw new Error('ov-title is ' + elements['ov-title'].textContent);
  }
  if (st.mode === 'playing') throw new Error('the gate must precede the run, not interrupt one');
});
s.check('the gate is the real reference (the manual pages + GOT IT, one source)', () => {
  // MANUAL v2 (2026-09-16): the reference is paginated — the check walks all
  // four pages and collects the whole manual. The retired TOUCH / KEYBOARD
  // cards live on as the merged CONTROLS page's subheads.
  let h = '';
  for (let p = 1; p <= 4; p++) { T.manual.goto(p); h += cards().map(c => c.innerHTML || '').join(''); }
  for (const t of ['>KEYBOARD CONTROLS<', '>TOUCH CONTROLS<', '>THE FIELD<', '>GOT IT<']) {
    if (!h.includes(t)) throw new Error('gate lost ' + t);
  }
  // parity: every canonical row is on the gate manual (no forked copy).
  const onComposite = new Set(['potion-hp', 'potion-mp', 'stats']);
  for (const c of CONTROLS) {
    if (onComposite.has(c.id)) continue;
    if (!h.includes(c.purpose)) throw new Error('gate lost the purpose of ' + c.id);
  }
});
s.check('the gate never hijacks play: no hint strip mounts under it', () => {
  pump(30);   // half a second of frames with the gate up
  if (stripEls().some(e => e.parentNode)) throw new Error('a hint mounted under the gate');
});
s.check('GOT IT on the gate sets the once-flag and STARTS THE RUN (clock advances)', () => {
  byTitle('GOT IT').click();
  if (globalThis.localStorage.getItem('hordes_onboarded') !== '1') {
    throw new Error('gate GOT IT did not set hordes_onboarded');
  }
  for (let i = 0; i < 60 * 8 && st.mode !== 'playing'; i++) pump(1);
  if (st.mode !== 'playing') throw new Error('gate GOT IT never started the run (mode ' + st.mode + ')');
  const t0 = st.time;
  pump(30);
  if (!(st.time > t0 + 0.4)) throw new Error('run clock frozen after the gate');
});

// ---- 2. never again uninvited ----------------------------------------------------
s.check('the gate never re-shows: death -> RETURN TO TITLE -> START GAME runs clean', () => {
  T.die();
  for (let i = 0; i < 10 && st.mode !== 'dead' && st.mode !== 'death-cine'; i++) pump(1);
  if (st.mode === 'death-cine') key('keydown', { key: 'x', preventDefault() {} });
  for (let i = 0; i < 5; i++) pump(1);
  key('keydown', { key: 't', preventDefault() {} });   // RETURN TO TITLE
  for (let i = 0; i < 5; i++) pump(1);
  if (st.mode !== 'title') throw new Error('not on the title (mode ' + st.mode + ')');
  byTitle('START GAME').click();
  if (elements['ov-title'].textContent === 'HOW TO PLAY') throw new Error('the gate re-showed uninvited');
  for (let i = 0; i < 60 * 8 && st.mode !== 'playing'; i++) pump(1);
  if (st.mode !== 'playing') throw new Error('second START GAME never ran (mode ' + st.mode + ')');
});
s.check('the title card keeps the reference re-openable (no way back: never one-shot)', () => {
  T.die();
  for (let i = 0; i < 10 && st.mode !== 'dead' && st.mode !== 'death-cine'; i++) pump(1);
  if (st.mode === 'death-cine') key('keydown', { key: 'x', preventDefault() {} });
  key('keydown', { key: 't', preventDefault() {} });
  for (let i = 0; i < 5; i++) pump(1);
  byTitle('HOW TO PLAY').click();
  if (elements['ov-title'].textContent !== 'HOW TO PLAY') throw new Error('title card did not re-open the reference');
  byTitle('GOT IT').click();
  for (let i = 0; i < 5; i++) pump(1);
  if (st.mode !== 'title') throw new Error('title-reference GOT IT must return to the title (mode ' + st.mode + ')');
});

// ---- 3. self-explaining controls -------------------------------------------------
s.check('every cog-row button carries a readable NAME (SETTINGS / HELP / RADAR / MAP)', () => {
  const want = { 'tc-cog': 'SETTINGS', 'tc-help': 'HELP', 'tc-radar': 'RADAR', 'tc-map': 'MAP' };
  for (const [id, name] of Object.entries(want)) {
    const m = new RegExp('id="' + id + '"[^>]*>([^<]*(?:<span[^>]*></span>)?[^<]*)</button>').exec(html);
    if (!m) throw new Error(id + ' not found in index.html');
    const label = m[1].replace(/<[^>]*>/g, '').trim();
    if (label !== name) throw new Error(id + ' reads "' + label + '" not "' + name + '"');
  }
  // the pixel gear stays (the smoke pins it); the NAME rides with it.
  if (!/cog-gear/.test(html)) throw new Error('the settings gear glyph was lost');
});
s.check('HP / MP / FROST / OVER keep their labels (unchanged by this work)', () => {
  for (const tok of ['>HP<', '>MP<', 'FROST', 'OVER']) {
    if (!html.includes(tok)) throw new Error('lost ' + tok);
  }
});
s.check('control-row names are ASCII, no emojis', () => {
  for (const name of ['SETTINGS', 'HELP', 'RADAR', 'MAP']) {
    if (!/^[\x20-\x7E]+$/.test(name)) throw new Error(name + ' is not ASCII');
  }
});

s.done();
