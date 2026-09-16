// HORDES — 0.98 PLAYER-FEEDBACK FIXES (three defects the audit classified).
// Run: node test/test_feedback_098.mjs
//
//   D1  the synergy announce painted as ONE unwrapped 9px line, so all seven
//       (513..627px measured) ran off the 480px view. Fixed: word-wrap to the
//       view, plate sized from the widest line, short messages unchanged.
//   D2  an owned pilot replaced its ability description with the equip
//       affordance. Fixed: the description is ALWAYS on the card.
//   D3  HP / MP / XP painted no numbers (they lived only in the opt-in text
//       HUD, default OFF). Fixed: measured values beside the bars.
//
// The renderer half imports ONLY render.js / config.js / entities.js (never
// main.js) — same contract as test_render_hud.mjs, so the canvas claims are
// provable while the game shell is being edited. The DOM half boots the REAL
// main.js through the shared harness and reads the overlay's card HTML.
import { Renderer } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { makePlayer } from '../src/entities.js';
import { SYNERGIES, describeSynergy } from '../src/synergies.js';
import { CHARACTERS } from '../src/meta.js';
import { readFileSync } from 'node:fs';
import { boot } from './_harness.mjs';

// One regex for "copy that claims S opens the field report" (the 0.98 audit
// fix). `S = move down` is the TRUTHFUL MANUAL warning and must NOT match.
const STALE_S_STATS = /S too|S \/ I stats|S or I stats|S opens/;

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---------- recording 2d context (style + geometry + text) -------------------
// Deliberately WITHOUT measureText: the headless path must stay assertable,
// and the renderer's fallback (9px monospace ~6px/char) is what it paints here.
function makeCtx() {
  const rec = { rects: [], texts: [], depth: 0 };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1, font: '10px monospace',
    textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
    lineWidth: 1, strokeStyle: '#000000',
    setTransform() {}, translate() {}, scale() {}, rotate() {},
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    save() { rec.depth++; },
    restore() { rec.depth = Math.max(0, rec.depth - 1); },
    fillRect(x, y, w, h) {
      rec.rects.push({ x, y, w, h, d: rec.depth, n: rec.rects.length, style: String(ctx.fillStyle) });
    },
    fillText(txt, x, y) {
      rec.texts.push({ txt: String(txt), x, y, d: rec.depth, n: rec.rects.length, font: String(ctx.font), style: String(ctx.fillStyle) });
    },
  };
  return { ctx, rec };
}
function makeRenderer() {
  const { ctx, rec } = makeCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  ctx.canvas = canvas;
  return { R: new Renderer(canvas), rec, ctx };
}
function isDarkPlate(style) {
  const m = /rgba?\(([^)]+)\)/.exec(style);
  let r, g, b, a = 1;
  if (m) { const p = m[1].split(',').map(v => parseFloat(v)); [r, g, b] = p; if (p.length > 3) a = p[3]; }
  else if (/^#[0-9a-f]{6}$/i.test(style)) {
    r = parseInt(style.slice(1, 3), 16); g = parseInt(style.slice(3, 5), 16); b = parseInt(style.slice(5, 7), 16);
  } else { return false; }
  return Math.max(r, g, b) < 70 && a > 0.55;
}
const plateFor = (rec, text) => rec.rects.find(q => q.n <= text.n && isDarkPlate(q.style) &&
  q.x <= text.x && q.x + q.w >= text.x + 6 && q.y <= text.y + 8 && q.y + q.h >= text.y + 3);
const textOf = (rec, s) => rec.texts.find(t => t.txt === s);

function hudState(over) {
  const p = makePlayer();
  p.x = 240; p.y = 150;
  const st = {
    player: p, time: 0, toasts: [], items: [], weapons: [],
    weather: null, mode: 'playing', zoom: 1, groundSeed: 7,
    enemies: [], projectiles: [], enemyShots: [], gems: [], drops: [],
    itemDrops: [], chests: [], arches: [], effects: [],
    wave: { num: 1, boss: null, bosses: [] }, cam: { x: 0, y: 0 },
  };
  return Object.assign(st, over || {});
}

// The EXACT message main.js's refreshSynergies() pushes (same construction),
// so this pins the real player-facing string, not a paraphrase.
const synergyMsgs = SYNERGIES.map((s) => {
  const d = describeSynergy(s);
  return 'SYNERGY: ' + d.name.toUpperCase() + ' — ' + d.desc;
});
const EST = 6;   // the windowless 9px-monospace advance the feed assumes

// ============================================================================
console.log('0.98 D1 — SYNERGY ANNOUNCE WRAPS INSIDE THE VIEW');
{
  ok(synergyMsgs.length === 7, 'all seven synergy announces are covered (' + synergyMsgs.length + ')');
  const { R, rec, ctx } = makeRenderer();
  const rows = [];
  for (const msg of synergyMsgs) {
    // (a) the audit's before-number: the OLD painter sized one line at
    // msg.length*6+3 and clipped everything past C.VIEW_W.
    const oldPlate = msg.length * EST + 3;
    ok(oldPlate > C.VIEW_W, 'the old single-line plate overflowed: ' + oldPlate + 'px of ' + C.VIEW_W + ' — ' + msg.slice(0, 34) + '…');

    // (b) paint it ALONE through the real HUD path.
    rec.rects.length = 0; rec.texts.length = 0;
    R.drawHudChrome(ctx, hudState({ toasts: [{ msg, ttl: 3, tint: null }] }));
    const entry = (R.hudChrome.feed || [])[0];
    const lines = entry ? entry.lines : null;
    ok(!!lines && lines.length >= 2, 'it wraps to multiple lines (' + (lines ? lines.length : 0) + '): ' + (lines || []).join(' | '));

    // (c) every painted line fits between the plate's left edge and the view.
    const painted = rec.texts.filter(t => lines && lines.includes(t.txt));
    const paintedRight = Math.max(0, ...painted.map(t => t.x + t.txt.length * EST));
    ok(painted.length === (lines ? lines.length : 0) && paintedRight <= C.VIEW_W,
      'no painted line reaches the view edge (rightmost ' + paintedRight + ' of ' + C.VIEW_W + ')');

    // (d) re-joining the wrapped lines reproduces the message EXACTLY — a wrap
    // that eats or reorders words is a lie, not a layout.
    ok(lines && lines.join(' ') === msg, 'the wrapped lines re-join to the original message');

    // (e) the plate is built from the measured lines: one rect, contains them,
    // never spans the view.
    const plate = rec.rects.find(q => q.x === 5 && q.y === 84);
    ok(!!plate && plate.w <= C.VIEW_W - 5,
      'the plate is sized from the lines and stays inside the view (w=' + (plate && plate.w) + ')');
    const plateRight = plate ? plate.x + plate.w : 0;
    ok(plateRight >= paintedRight, 'the plate covers every wrapped line (' + plateRight + ' >= ' + paintedRight + ')');
    rows.push({ name: msg.slice(9).split(' — ')[0], old: oldPlate, lines: lines ? lines.length : 0, right: paintedRight, plate: plate ? plate.w : 0 });
  }

  // (f) tasteful: a SHORT message is still exactly one line, on a plate that
  // hugs the text (the old geometry, to the pixel).
  rec.rects.length = 0; rec.texts.length = 0;
  R.drawHudChrome(ctx, hudState({ toasts: [{ msg: 'BOSS DOWN', ttl: 3, tint: null }] }));
  const one = (R.hudChrome.feed || [])[0];
  ok(one && one.lines && one.lines.length === 1, 'a short message stays ONE line (not a stubby box)');
  const shortPlate = rec.rects.find(q => q.x === 5 && q.y === 84);
  ok(!!shortPlate && shortPlate.h === 11 && shortPlate.w === 'BOSS DOWN'.length * EST + 4,
    'the single-line plate keeps the feed geometry (11px tall, hugging the text): ' +
    (shortPlate ? shortPlate.w + 'x' + shortPlate.h : 'none'));

  // (g) stacking: two toasts must not overlap — the second starts below the
  // first one's LAST line.
  rec.rects.length = 0; rec.texts.length = 0;
  R.drawHudChrome(ctx, hudState({ toasts: [
    { msg: synergyMsgs[0], ttl: 3, tint: null },
    { msg: synergyMsgs[1], ttl: 3, tint: null }] }));
  const f = R.hudChrome.feed;
  const firstBottom = 86 - 2 + (f[0].lines || []).length * 10 + 1;
  const secondTop = rec.rects.filter(q => q.x === 5)[1];
  ok(f.length === 2 && secondTop && secondTop.y >= firstBottom - 2,
    'a second toast stacks below the wrapped first (plate2 top ' + (secondTop && secondTop.y) + ' >= ' + (firstBottom - 2) + ')');
  const totalBottom = Math.max(...rec.rects.filter(q => q.x === 5).map(q => q.y + q.h));
  ok(totalBottom < C.VIEW_H - 60, 'the wrapped feed stays clear of the weapon row (' + totalBottom + ' of ' + C.VIEW_H + ')');
  console.log('  measured: ' + rows.map(r => r.name + ' ' + r.old + 'px -> ' + r.lines + ' lines, right ' + r.right + ', plate ' + r.plate).join(' | '));
}

// ============================================================================
console.log('0.98 D3 — HP / MP / XP NUMBERS ON THE ALWAYS-ON HUD');
{
  const { R, rec, ctx } = makeRenderer();
  const st = hudState();
  st.player.hp = 74; st.player.stats.maxHp = 120;
  st.player.mana = 33; st.player.stats.maxMana = 60;
  st.player.xp = 42; st.player.xpNext = 100; st.player.level = 4;
  R.drawHudChrome(ctx, st);

  for (const want of ['74/120', '33/60', '42/100']) {
    const t = textOf(rec, want);
    ok(!!t, 'the value "' + want + '" is painted on the canvas');
    ok(t && plateFor(rec, t), '"' + want + '" rides a dark readability plate');
    ok(t && t.x >= 134 && t.x + Math.max(1, t.txt.length) * EST <= C.VIEW_W,
      '"' + want + '" is clear of the bar end (x=' + (t && t.x) + ') and inside the view');
  }
  ok(R.hudChrome.hpText === '74/120' && R.hudChrome.mpText === '33/60' && R.hudChrome.xpText === '42/100',
    'the chrome seam reports the three values');
  // The clock owns the top-right column: the values must not reach it.
  const clock = textOf(rec, '00:00');
  const valRightMost = Math.max(0, ...['74/120', '33/60', '42/100']
    .map(s => { const t = textOf(rec, s); return t ? t.x + t.txt.length * EST : 0; }));
  ok(clock && valRightMost < clock.x - 2,
    'the values stop short of the run clock (' + valRightMost + ' < ' + (clock && clock.x) + ')');
  // Fraction readouts track the live numbers (no stale/rounded-up text).
  rec.texts.length = 0; rec.rects.length = 0;
  st.player.hp = 7; st.player.mana = 1;
  R.drawHudChrome(ctx, st);
  ok(!!textOf(rec, '7/120') && !!textOf(rec, '1/60'), 'the numbers follow the live hp/mana');
  // The XP row keeps its LV badge (nothing was displaced by the new value).
  ok(!!textOf(rec, 'LV 4'), 'the LV badge still paints beside the XP value');
  // Level cap: xpNext = 0 paints no "0/0" noise.
  rec.texts.length = 0;
  st.player.xpNext = 0;
  R.drawHudChrome(ctx, st);
  ok(!rec.texts.some(t => /^0\/0$/.test(t.txt)), 'no "0/0" XP value is painted at the level cap');
  ok(R.hudChrome.xpText === undefined, 'and the seam reports no xpText at the cap');
  // Old behaviour preserved: the static bar labels + fill rects are untouched.
  ok(!!textOf(rec, 'HP') && !!textOf(rec, 'MP') && !!textOf(rec, 'XP'), 'the HP / MP / XP labels are unchanged');
}

// ============================================================================
console.log('0.98 D2 — AN OWNED PILOT KEEPS ITS ABILITY DESCRIPTION (DOM)');
{
  const { T, elements, pump } = await boot();
  const cards = () => elements['ov-cards'].children;
  const html = () => [...cards()].map(c => c.innerHTML || '').join('\n');
  const clickCard = (title) => {
    const c = [...cards()].find(x => (x.innerHTML || '').includes('>' + title + '<'));
    if (!c) throw new Error('no card titled ' + title + ' (have: ' +
      [...cards()].map(x => x.innerHTML || '').join(' / ') + ')');
    c.click();
    return c;
  };
  // The 7s intro movie plays before the menu, and a FIRST boot hands off to
  // the one-time HOW TO PLAY screen (empty shim storage). Pump to the menu,
  // then step past the onboarding screen if it is the one that landed.
  for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
  if (elements['ov-title'] && elements['ov-title'].textContent === 'HOW TO PLAY') clickCard('GOT IT');
  const charIds = Object.keys(CHARACTERS);

  // ---- copy truthfulness (0.98: I is the ONE stats key; S is movement) ----
  // The keyboard card is what a player reads before their first run.
  // Onboarding rework (2026-09-16): HOW TO PLAY is a TITLE card again — one
  // tap from the menu, not two.
  clickCard('HOW TO PLAY');
  ok(/I — field report \(the ONE stats key\)/.test(html()),
    'HOW TO PLAY names I as the ONE stats key');
  ok(!STALE_S_STATS.test(html()),
    'HOW TO PLAY never teaches S as the stats key (the stale "(S too, in AUTO)" line is gone)');
  ok(/SURVIVE THE WAVES/.test(elements['ov-sub'].innerHTML || ''),
    'the HOW TO PLAY screen is the real one (point line present)');
  clickCard('GOT IT');                       // -> title

  // (a) the starting state: one owned (equipped) pilot, three locked.
  clickCard('CHARACTERS');
  for (const id of charIds) {
    ok(html().includes(CHARACTERS[id].desc),
      'every pilot card carries its ability description (' + id + ')');
  }
  ok(html().includes('unlock: ' + CHARACTERS.WITCH.unlockCost + ' gold'),
    'a locked pilot still shows its unlock cost');

  // (b) THE DEFECT: own one, re-open. The description must survive.
  const prof = T.getProfile();
  if (!prof.unlockedCharacters.includes('WITCH')) prof.unlockedCharacters.push('WITCH');
  clickCard('BACK');
  clickCard('CHARACTERS');
  ok(html().includes(CHARACTERS.WITCH.desc),
    'THE OWNED PILOT STILL SHOWS ITS ABILITY DESCRIPTION: "' + CHARACTERS.WITCH.desc + '"');
  ok(html().includes('equip this pilot'),
    'and the equip affordance is still there alongside it');

  // (c) equipped too: description + EQUIPPED.
  prof.equippedCharacter = 'WITCH';
  clickCard('BACK');
  clickCard('CHARACTERS');
  ok(html().includes(CHARACTERS.WITCH.desc), 'the EQUIPPED pilot keeps its description');
  ok(html().includes('EQUIPPED'), 'and still reads EQUIPPED');
  ok(html().includes(CHARACTERS.KNIGHT.desc), 'the other owned pilot is unaffected');
  console.log('  DOM: ' + charIds.length + ' pilots checked owned + locked + equipped');
}

// ============================================================================
console.log('0.98 COPY — THE STATS / S BINDING IN EVERY STATIC SURFACE');
{
  // The audit pass asked for every remaining claim that S opens the field
  // report to be corrected. These are the STATIC surfaces the player reads:
  // the overlay legend (index.html), the HOW TO PLAY / hint / coachmark strings
  // (src/main.js) and the tour module's own copy (src/tour.js).
  const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
  // Comments are stripped: the code documents the OLD line it removed, and a
  // comment is not copy a player can be lied to by.
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const html = read('index.html');
  const main = code(read('src/main.js'));
  const tour = code(read('src/tour.js'));

  const legend = /id="ov-legend"[^>]*>([^<]*)</.exec(html);
  ok(!!legend && /I stats/.test(legend[1]),
    'the overlay legend names I as the stats key');
  ok(!!legend && !STALE_S_STATS.test(legend[1]), 'the legend does not teach S as the stats key');
  ok(!STALE_S_STATS.test(html), 'index.html carries no stale S-opens-the-report copy');
  ok(!STALE_S_STATS.test(main), 'src/main.js carries no stale S-opens-the-report copy');
  ok(!STALE_S_STATS.test(tour), 'src/tour.js carries no stale S-opens-the-report copy');
  ok(/'H \/ N — potions &middot; I — field report \(the ONE stats key\)/.test(main),
    'the HOW TO PLAY keyboard card names I alone');
  ok(/'I stats &middot; ESC close \/ pause'/.test(main) &&
     /'I stats \(S = move down\) &middot; ESC close \/ pause'/.test(main),
    'both hint panels name I as the stats key (MANUAL warns S is movement)');
  // ONBOARDING REWORK (2026-09-16, owner-approved): the scheduled in-run
  // coachmarks are deleted (hint layer replaces them, test_onboarding.mjs).
  // The stats coach's copy ('STATS (I) opens the FIELD REPORT') retired with
  // it — what remains is the NEGATIVE: no coach copy may survive in main.js
  // teaching any stats binding, because the binding is taught by the HOW TO
  // PLAY keyboard card + the live hint panels, both asserted above.
  ok(!/opens the FIELD REPORT/.test(main),
    'the retired stats coachmark left no copy behind (the hint layer owns the teaching now)');
  // And the truthful MANUAL warning survives the sweep (not over-corrected).
  ok(/S = move down/.test(main), 'the MANUAL hint still tells the player what S does');
}

if (failed) { console.error('\n' + failed + ' FAILURES'); process.exit(1); }
console.log('\nALL 0.98 FEEDBACK TESTS PASSED');
