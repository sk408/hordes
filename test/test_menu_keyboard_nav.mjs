// HORDES — MENU KEYBOARD NAVIGATION.
// Run: node test/test_menu_keyboard_nav.mjs
//
// Owner (2026-09-19), verbatim: "keyboard controls work through our menus like
// the title menus and any menu. arrow keys, tab, enter."
//
// CONTRACT
//   * On every card menu, arrows and Tab walk a visible cursor over the cards.
//   * Enter / Space activates the focused card through menuCard's OWN onclick —
//     the pointer path — so the help-mode intercept and the button sfx stay one
//     implementation.
//   * DIM cards (a pager end, a locked row) are unreachable: Enter can never fire
//     a card the pointer would refuse.
//   * The cursor RESETS when a menu opens, so a stale index can never fire the
//     wrong row on the next screen.
//
// MODES COVERED HERE: 'title' (the title screen is its own mode — showTitle()
// calls openMenu('title')), 'menu' (sub-screens: the manual / shop / etc.), and
// 'characters' / 'loadout'. NOT covered, deliberately: the galleries
// (trophies/bestiary/apex) keep Left/Right stepping, the shop and manual keep
// Left/Right paging, and the draft/evolve/intermission/dead/chest screens keep
// their documented number/letter contracts.
//
// Driven through the REAL seam: h.key('keydown', ...) invokes the same window
// listener the browser does. The stub DOM's focus() is a no-op, so the cursor is
// read from the test surface — the draftFocus precedent.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';

const S = suite('test_menu_keyboard_nav');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;

const cards = () => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : []);
const has = (c, t) => (c && c.innerHTML || '').includes(t);
const cardWith = (t) => cards().find(c => has(c, t));
const indexOfCard = (t) => cards().findIndex(c => has(c, t));
// Dim detection is className-based on purpose: the stub DOM keeps classList and
// className as separate stores and menuCard writes className, so a
// classList-only check here would silently assert nothing.
const isDim = (c) => !!(c && typeof c.className === 'string' && /\bdim\b/.test(c.className));
const key = (k, extra = {}) => h.key('keydown', { key: k, preventDefault() {}, ...extra });

// Every check starts from a clean title screen with no cursor.
function title() {
  T.showTitle();
  if (st.mode === 'intro') key('x');                 // any key skips the intro movie
  assert.equal(st.mode, 'title', 'the title is up');
}

// ---------------------------------------------------------------------------
S.check('the title screen has cards and opens with NO cursor', () => {
  title();
  assert.ok(cards().length > 0, 'the title has cards (' + cards().length + ')');
  assert.equal(T.menuFocus(), -1, 'a fresh menu open starts with no cursor');
});

S.check('ArrowDown steps forward from nothing, then card by card', () => {
  title();
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'the first ArrowDown selects card 0');
  key('arrowdown');
  assert.equal(T.menuFocus(), 1, 'the next ArrowDown selects card 1');
  key('arrowup');
  assert.equal(T.menuFocus(), 0, 'ArrowUp steps back');
});

S.check('ArrowUp from nothing wraps to the LAST card', () => {
  title();
  key('arrowup');
  assert.equal(T.menuFocus(), cards().length - 1, 'ArrowUp wraps to the last card');
});

S.check('the cursor wraps forward off the end', () => {
  title();
  const n = cards().length;
  for (let i = 0; i < n; i++) key('arrowdown');      // land on the last card
  assert.equal(T.menuFocus(), n - 1, 'walked to the last card');
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'and wraps to the first');
});

S.check('Tab advances and Shift+Tab retreats', () => {
  title();
  key('tab');
  assert.equal(T.menuFocus(), 0, 'Tab starts the cursor');
  key('tab');
  assert.equal(T.menuFocus(), 1, 'Tab advances');
  key('tab', { shiftKey: true });
  assert.equal(T.menuFocus(), 0, 'Shift+Tab retreats');
});

S.check('Enter activates the focused card (through menuCard onclick)', () => {
  title();
  const i = indexOfCard('HOW TO PLAY');
  assert.ok(i >= 0, 'the title has a HOW TO PLAY card');
  for (let n = 0; n <= i; n++) key('arrowdown');      // -1 -> 0 is one press
  assert.equal(T.menuFocus(), i, 'the cursor sits on HOW TO PLAY');
  key('enter');
  // HOW TO PLAY opens the paginated reference: that it opened AT ALL is the
  // assertion — the cursor fired the card the pointer would have.
  assert.equal(st.manualPage, 1, 'Enter opened the reference (page 1)');
});

S.check('Space activates too (the second documented key)', () => {
  title();
  const i = indexOfCard('HOW TO PLAY');
  for (let n = 0; n <= i; n++) key('arrowdown');
  key(' ');
  assert.equal(st.manualPage, 1, 'Space activated the focused card');
});

S.check('DIM cards are unreachable — the cursor skips them', () => {
  title();
  cardWith('HOW TO PLAY').click();
  assert.equal(st.manualPage, 1, 'the reference is on page 1');
  const prev = indexOfCard('PREV');
  assert.ok(prev >= 0, 'there is a PREV card');
  assert.ok(isDim(cards()[prev]), 'PREV is dim on page 1 (nothing to go back to)');
  // Walk the whole ring from nothing; the dim PREV must never be selected.
  title();                                            // back to the title first
  cardWith('HOW TO PLAY').click();                     // fresh open, cursor reset
  const seen = [];
  for (let n = 0; n < cards().length + 2; n++) { key('arrowdown'); seen.push(T.menuFocus()); }
  assert.ok(!seen.includes(prev), 'the cursor never lands on the dim PREV card');
});

S.check('the cursor RESETS when a menu opens (no stale index)', () => {
  title();
  key('arrowdown');
  key('arrowdown');
  assert.ok(T.menuFocus() >= 0, 'a cursor exists on the title');
  cardWith('HOW TO PLAY').click();                    // open a different screen
  assert.equal(T.menuFocus(), -1, 'opening a menu clears the cursor');
});

S.check('the cursor RESETS on a fresh title open too', () => {
  title();
  key('arrowdown');
  assert.ok(T.menuFocus() >= 0, 'a cursor exists');
  title();                                            // re-open the title
  assert.equal(T.menuFocus(), -1, 're-opening the title clears the cursor');
});

S.check('Escape still backs a sub-menu out to the title', () => {
  title();
  cardWith('HOW TO PLAY').click();
  assert.equal(st.manualPage, 1, 'the reference is up');
  key('escape');
  assert.equal(st.mode, 'title', 'ESC lands back on the title');
});

S.done();
