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
import { makeTypedEnemy } from '../src/enemy_types.js';

const S = suite('test_menu_keyboard_nav');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;
const pump = h.pump;

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

// The owner's report: "none of the selections get highlighted to show me which
// one I would be selecting". Moving the cursor is not the feature — SEEING it is.
// The marker is a class on className (the cards are DIVs, so focus() paints
// nothing at all — see setSelCard in main.js).
const isSel = (c) => !!(c && typeof c.className === 'string' && /\bsel\b/.test(c.className));
const selCount = () => cards().filter(isSel).length;

S.check('the cursor card is VISIBLY marked', () => {
  title();
  assert.equal(selCount(), 0, 'nothing is marked before the first key');
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'the cursor is on card 0');
  assert.ok(isSel(cards()[0]), 'card 0 carries the selection marker');
});

S.check('the marker MOVES with the cursor — never two, never none', () => {
  title();
  key('arrowdown');
  key('arrowdown');
  assert.equal(selCount(), 1, 'exactly ONE card is marked');
  assert.ok(isSel(cards()[T.menuFocus()]), 'and it is the cursor card');
  assert.ok(!isSel(cards()[0]), 'the card left behind is unmarked');

  const n = cards().length;
  for (let i = 0; i < n + 2; i++) key('arrowdown');       // wrap right round
  assert.equal(selCount(), 1, 'still exactly one marked after a full lap');
  assert.ok(isSel(cards()[T.menuFocus()]), 'and it is still the cursor card');

  key('arrowup');
  assert.equal(selCount(), 1, 'stepping back keeps exactly one marked');
  assert.ok(isSel(cards()[T.menuFocus()]), 'on the cursor card');
});

S.check('the marker skips dim cards too (it is the cursor, not a scan)', () => {
  title();
  cardWith('HOW TO PLAY').click();
  const prev = indexOfCard('PREV');
  assert.ok(isDim(cards()[prev]), 'PREV is dim on page 1');
  for (let i = 0; i < cards().length + 2; i++) {
    key('arrowdown');
    assert.ok(!isSel(cards()[prev]), 'the dim PREV is never marked');
    assert.equal(selCount(), 1, 'and exactly one card is marked at every step');
  }
});

S.check('opening a menu clears the marker with the cursor', () => {
  title();
  key('arrowdown');
  assert.equal(selCount(), 1, 'a card is marked on the title');
  cardWith('HOW TO PLAY').click();                        // different screen
  assert.equal(selCount(), 0, 'the fresh screen starts with nothing marked');
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

// ---- THE RUN-ENDED SCREEN ------------------------------------------------
// Owner: "the run ended screen doesnt let me use keyboard controls". Three paths
// land on mode 'dead' (a death, a deliberate END RUN, the RUN SURVIVED win) and
// all compose through composeEndScreen, which does NOT go through openMenu — so
// the cursor reset that lived in openMenu never ran for this screen.
//
// Driven through the REAL frame loop: a typed enemy parked on the hero (the
// test_death_screen recipe), so the end screen is the one a player actually gets.
function toEndScreen() {
  T.startRun();
  pump(3);
  const p = st.player;
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  st.spawnTimer = 999;                       // no ambient spawns
  st.wave.endsAt = st.time + 9999;
  st.enemies.length = 0; st.gems.length = 0;
  const killer = makeTypedEnemy('SPITTER', p.x, p.y, st.time);
  killer.hp = killer.maxHp = 1e6;            // survives the hero's own volley
  killer.speed = 0;                          // parked exactly on the hero
  st.enemies.push(killer);
  pump(30, () => { st.enemies.forEach(e => { e.speed = 0; e.x = p.x; e.y = p.y; }); });
  if (st.mode === 'death-cine') key('x');    // any key skips the movie
  assert.equal(st.mode, 'dead', 'the run-ended screen is up');
}

S.check('the RUN-ENDED screen takes keyboard navigation', () => {
  toEndScreen();
  assert.equal(T.menuFocus(), -1, 'it opens with no cursor');
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'ArrowDown selects the first card');
  assert.equal(selCount(), 1, 'and it is visibly marked');
  key('arrowdown');
  assert.equal(T.menuFocus(), 1, 'ArrowDown advances');
  key('tab');
  assert.equal(T.menuFocus(), 2, 'Tab advances too');
  assert.equal(selCount(), 1, 'exactly one card marked throughout');
  key('tab', { shiftKey: true });
  assert.equal(T.menuFocus(), 1, 'Shift+Tab retreats');
});

S.check('Enter activates on the run-ended screen (the cursor used to do nothing)', () => {
  toEndScreen();
  const retry = indexOfCard('RETRY');
  assert.ok(retry >= 0, 'there is a RETRY card');
  for (let n = 0; n < retry + 1; n++) key('arrowdown');   // -1 -> 0 is one press
  assert.equal(T.menuFocus(), retry, 'the cursor is on RETRY');
  key('enter');
  assert.equal(st.mode, 'playing', 'Enter started the next run');
});

S.check('r and t still work on the run-ended screen (they were its only keys)', () => {
  toEndScreen();
  key('t');
  assert.equal(st.mode, 'title', 'T still returns to the title');
});

// ---- THE EXPANDED SURFACE (owner: "ok go ahead") ---------------------------
// The evolve overlay was DIGIT-ONLY and the intermission had no arrows at all.
// These four assert the ROUTING — that each mode branch reaches the shared nav
// ladder — using whatever cards a title open leaves on screen; each screen's own
// composition has its own tests. st.mode is set directly ONLY for routing, which
// is the thing that can be wrong per screen.
S.check('the EVOLVE overlay routes arrows/Tab to the cursor', () => {
  title();
  st.mode = 'evolve';                       // routing under test
  assert.equal(selCount(), 0, 'no cursor to start');
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'ArrowDown selects the first card');
  assert.equal(selCount(), 1, 'and it is visibly marked');
  key('tab');
  assert.equal(T.menuFocus(), 1, 'Tab advances');
});

S.check('the INTERMISSION routes arrows/Tab to the cursor', () => {
  title();
  st.mode = 'intermission';
  const n = cards().length;
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'ArrowDown selects the first card');
  assert.equal(selCount(), 1, 'and it is visibly marked');
  key('tab', { shiftKey: true });
  assert.equal(T.menuFocus(), n - 1, 'Shift+Tab from the first wraps to the last');
  // 'c' must still continue (its documented key) — asserted as still reachable,
  // not pressed here, because a synthetic mode has no live run to continue.
  assert.equal(selCount(), 1, 'exactly one card marked');
});

S.check('the FIELD REPORT routes arrows to the cursor', () => {
  title();
  st.mode = 'stats';
  key('arrowdown');
  assert.equal(T.menuFocus(), 0, 'ArrowDown selects the first card');
  assert.equal(selCount(), 1, 'and it is visibly marked');
});

S.check('the DRAFT offer row takes Tab, and its cursor is now VISIBLE', () => {
  title();
  st.pendingDrafts = 1;
  T.openDraft();                            // the real seam
  assert.equal(st.mode, 'draft', 'a draft is up');
  const n = cards().length;
  assert.ok(n >= 2, 'there are offers to move between (' + n + ')');
  key('arrowdown');
  assert.equal(T.draftFocus(), 0, 'the draft cursor is on the first offer');
  assert.equal(selCount(), 1, 'and it is VISIBLY marked — it used to be invisible');
  key('tab');
  assert.equal(T.draftFocus(), 1, 'Tab advances the draft cursor');
  assert.equal(selCount(), 1, 'still exactly one marked');
  key('tab', { shiftKey: true });
  assert.equal(T.draftFocus(), 0, 'Shift+Tab retreats');
  assert.equal(selCount(), 1, 'and still exactly one marked');
});

// ---- OWNER ROUND 3: two-press cursor + the radar preference -----------------
S.check('a two-press card KEEPS the cursor after the first press (END RUN)', () => {
  T.startRun();
  pump(2);
  key('escape');                                  // ESC/P opens the in-run pause
  assert.equal(st.mode, 'settings', 'the in-run settings pause is up');
  const idx = indexOfCard('END RUN');
  assert.ok(idx >= 0, 'there is an END RUN card');
  for (let n = 0; n < idx + 1; n++) key('arrowdown');   // -1 -> 0 is one press
  assert.equal(T.menuFocus(), idx, 'the cursor is on END RUN');
  key('enter');                                   // press ONE: arms it
  assert.equal(st.mode, 'settings', 'still on the same screen (armed, not fired)');
  assert.ok(cardWith('CONFIRM END RUN?'), 'the card now reads CONFIRM END RUN?');
  // THE FIX (owner): "they lose focus after the first press and have to be
  // navigated to again. be better if it stayed selected to push twice easily."
  assert.equal(T.menuFocus(), indexOfCard('CONFIRM END RUN?'), 'the cursor STAYED put');
  assert.equal(selCount(), 1, 'and the marker is still visible');
  key('enter');                                   // press TWO: fires
  assert.notEqual(st.mode, 'settings', 'the second press ended the run');
});

S.check('the radar is ON by default', () => {
  // Owner: "maybe we should make the radar on by default instead."
  assert.equal(st.radarOn, true, 'radarOn defaults to true');
});

S.check('toggling the radar PERSISTS the choice', () => {
  T.startRun();
  pump(2);
  assert.equal(st.radarOn, true, 'on when the run starts');
  key('r');                                       // the real key path
  assert.equal(st.radarOn, false, 'R turned it off');
  assert.equal(h.storage.get('hordes_radar'), '0', 'and the choice was written down');
  key('r');
  assert.equal(st.radarOn, true, 'R turned it back on');
  assert.equal(h.storage.get('hordes_radar'), '1', 'and that was written too');
});

// ---- OWNER ROUND 3: the shop footer ----------------------------------------
S.check('the shop BACK button is on EVERY page, not just the last', () => {
  title();
  // The pager deliberately no-ops when the DOM reports no layout ("stub: markup is
  // the contract"), so hand it the numbers a real layout would. Opening that guard
  // is the only way to assert paging headlessly.
  const ovc = h.elements['ov-cards'];
  ovc.clientWidth = 640;
  ovc.offsetTop = 0;
  h.elements['overlay'].clientHeight = 300;
  cardWith('SHOP').click();                          // the real door
  for (const c of cards()) c.offsetHeight = 40;      // uniform rows
  // The rAF queue is SHARED with the game's own frame loop (which re-registers
  // every frame), so one pump can run the frame callback instead of the pager.
  // Drain a few, bounded — the pager callback is sitting behind it.
  for (let i = 0; i < 4; i++) pump(1);
  const back = cardWith('BACK');
  assert.ok(back, 'there is a BACK card');
  assert.ok(/\bshop-footer\b/.test(back.className), 'BACK carries the footer tag');
  const visible = () => cards().filter(c => c.style.display !== 'none');
  assert.ok(visible().length < cards().length,
    'the pager is live (some cards are paged out): ' + visible().length + '/' + cards().length);
  assert.ok(visible().includes(back), 'BACK is visible on page 1');
  // OWNER: "we still need the shop to have the back button underneath the list of
  // buyables on each page instead of once at the end."
  key('pagedown');                                   // paging key since arrows became the cursor's
  assert.equal(back.style.display, '', 'BACK is STILL visible on page 2');
  assert.ok(visible().includes(back), 'and still in the visible set on page 2');
  key('pageup');
  assert.equal(back.style.display, '', 'and back again on page 1');
});

S.done();
