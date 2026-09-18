// THE MANUAL v2 (owner 2026-09-16, msg_01M2P2714VDKY07BBWWCX3G7CC - live on a
// portrait Android phone: "the card doesn't show on the screen. It's cut
// off."). Structure + geometry-source pins for the rebuilt manual:
//   1. PAGES: the manual is paginated - page indicator (n / N), PREV/NEXT
//      cards, arrow-key parity; the CONTENTS index row is GONE (settled
//      shape 2026-09-18: small PREV/NEXT under the instructions, text
//      dominant);
//   2. ONE CARD, NOT TWO: the separate TOUCH and KEYBOARD cards are retired -
//      a single CONTROLS page with subheads, the PLAYER'S OWN input path
//      first (touch device -> touch first; desktop -> keys first);
//   3. HOW A RUN WORKS: waves and what ends one, the intermission, what the
//      choices do (draft / upgrade, shrine, arch, chest, challenge), how a run
//      ends (death and victory) - dense, numbers where they exist;
//   4. OPTIONS AND MODES: one plain line each on PILOT auto vs manual,
//      targeting, STANCE - plus LIVE callouts read from state at open time;
//   5. GOT IT sits in the layout (a flow footer card), never sticky over the
//      scrolling body;
//   6. THE FIELD page still renders from OBJECT_HELP (one source);
//   7. HINT STRIP GEOMETRY (the owner's mirror fault - "text runs past the
//      right edge and wraps mid-sentence"): layoutStrip clamps into the
//      VIEWPORT as well as the container, and the strip's width is capped to
//      the viewport when the letterboxed container overflows it.
// The real-browser bounding boxes (320x568 / 360x800 / 568x320) live in
// tools/verify_help_mobile.mjs - a stub DOM cannot lay text out.
// Run: node test/test_manual.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { layoutStrip, HintStrip } from '../src/onboarding.js';

const s = suite('test_manual-strip');
const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ---- 7. HINT STRIP GEOMETRY first (pure unit level) -------------------------
{
  // The owner fault: a phone whose letterboxed game container is WIDER than
  // the viewport (AUTO fit floors at 1 on short edges). The container here is
  // ASYMMETRICALLY off-centre (left -80, right 480 on a 320px screen) so the
  // centred strip genuinely lands past the right edge at 340 without the
  // viewport clamp — a symmetric fixture would pass by accident.
  const cRect = { left: -80, top: 0, right: 480, bottom: 568, width: 560, height: 568 };
  const vp = { left: 0, top: 0, right: 320, bottom: 568, width: 320, height: 568 };
  const r = layoutStrip(cRect, 280, 24, [], vp);
  s.check('layoutStrip clamps the strip fully inside the VIEWPORT, not just the container', () => {
    assert.ok(r.left >= 0 && r.right <= 320,
      'strip must sit in [0,320] (got ' + r.left + '..' + r.right + ')');
  });
  // And a container shifted above the viewport (the phone's letterbox can do
  // this too) still pins the strip inside it vertically.
  const cUp = { left: -80, top: -100, right: 400, bottom: 468, width: 480, height: 568 };
  const r2 = layoutStrip(cUp, 280, 24, [], vp);
  s.check('layoutStrip clamps vertically too (the strip never leaves the viewport)', () => {
    assert.ok(r2.top >= 0 && r2.bottom <= 568, 'got ' + r2.top + '..' + r2.bottom);
  });
  // No viewport given: the old container-only behaviour (nothing breaks).
  const r3 = layoutStrip(cRect, 280, 24, []);
  s.check('without a viewport rect the container clamp is unchanged (compat)', () => {
    assert.ok(r3.left >= -76 && r3.right <= 476, 'got ' + r3.left + '..' + r3.right);
  });
}
{
  // The strip element's WIDTH is capped to the viewport at mount/layout time
  // (the owner's "runs past the right edge"): a stub element with no layout
  // still exposes the computed style, which is what the browser reads. The
  // viewport here (260px) is NARROWER than the 280px max so the cap genuinely
  // binds — on a wider viewport the check would pass by accident.
  const doc = {
    createElement: () => ({ id: '', style: {}, textContent: '' }),
    documentElement: { clientWidth: 260, clientHeight: 568 },
    body: { appendChild() {} },
  };
  const strip = new HintStrip({
    anchor: () => ({ left: -80, top: 0, right: 400, bottom: 568, width: 480, height: 568 }),
    mount: doc.body, doc,
  });
  strip.show('map', 'MAP: open the world map (the fight keeps running)');
  strip.update(1 / 60);
  s.check('the strip width is capped to the viewport (owner: runs past the right edge)', () => {
    const w = parseFloat(strip.el.style.width);
    assert.ok(Number.isFinite(w) && w <= 252,
      'width must be <= viewport-8 = 252 (style.width="' + strip.el.style.width + '")');
  });
}

{
  // THE OWNER'S OTHER FAULT (msg_01M2P2714VDKY07BBWWCX3G7CC: the hint card
  // "overlaps HUD bars (HP/MP/XP/GOLD)"): the top-centre candidate must
  // YIELD when the HUD readout block is an avoid rect (it lands bottom).
  const cRect = { left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 };
  const hud = { left: 0, top: 0, right: 200, bottom: 52 };   // the native HUD block
  const r = layoutStrip(cRect, 280, 24, [hud]);
  s.check('layoutStrip yields the top row to the HUD readout block (owner: overlaps HUD bars)', () => {
    assert.ok(r.bottom <= hud.top + 4 || r.top >= hud.bottom - 4,
      'the strip must clear the HUD block (got ' + r.top + '..' + r.bottom + ')');
  });
  // ... and the live avoid list carries the projected block (source pin:
  // the projection is canvasRegion, the same seam the coachmarks use).
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  s.check('the strip avoid list includes the projected HUD readout block', () => {
    assert.ok(/canvasRegion\(0, 0, 200, 52\)/.test(src),
      'onboardingAvoid must avoid canvasRegion(0,0,200,52)');
  });
}

// ---- desktop boot: pages, one card, sections ---------------------------------
const { T, state: st, elements, pump, key } = await boot({ storage: [['hordes_onboarded', '1']] });
const cards = () => [...elements['ov-cards'].children];
const cardWith = (t) => cards().find(c => (c.innerHTML || '').includes('>' + t + '<'));
const kdown = (k) => key('keydown', { key: k, preventDefault() {} });

for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
assert.equal(elements['ov-title'].textContent, 'HORDES', 'must boot to the title');
const howTo = cards().find(c => (c.innerHTML || '').includes('>HOW TO PLAY<'));
assert.ok(howTo, 'title HOW TO PLAY card present');
howTo.click();

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok - ' + name); };

// ---- 1. PAGES ---------------------------------------------------------------
check('page 1 opens with the PAGE indicator and the PREV card dimmed', () => {
  assert.ok(/PAGE 1 \/ 4/.test(elements['ov-sub'].innerHTML),
    'indicator must read PAGE 1 / 4: ' + elements['ov-sub'].innerHTML);
  const prev = cardWith('PREV');
  assert.ok(prev, 'PREV card present');
  assert.ok((prev.className || '').includes('dim'), 'PREV is dim on page 1');
});
check('NEXT walks 2 -> 3 -> 4, then dims; the indicator tracks', () => {
  cardWith('NEXT').click();
  assert.ok(/PAGE 2 \/ 4/.test(elements['ov-sub'].innerHTML), 'page 2 after NEXT');
  cardWith('NEXT').click();
  assert.ok(/PAGE 3 \/ 4/.test(elements['ov-sub'].innerHTML), 'page 3');
  cardWith('NEXT').click();
  assert.ok(/PAGE 4 \/ 4/.test(elements['ov-sub'].innerHTML), 'page 4');
  assert.ok((cardWith('NEXT').className || '').includes('dim'), 'NEXT is dim on the last page');
  assert.ok(!(cardWith('PREV').className || '').includes('dim'), 'PREV is live on page 4');
});
check('arrow keys navigate pages too (Left/Right parity with the cards)', () => {
  kdown('ArrowLeft');   // PREV via the real keydown seam
  assert.ok(/PAGE 3 \/ 4/.test(elements['ov-sub'].innerHTML), 'ArrowLeft -> page 3');
  kdown('ArrowRight');
  assert.ok(/PAGE 4 \/ 4/.test(elements['ov-sub'].innerHTML), 'ArrowRight -> page 4');
  kdown('ArrowLeft'); kdown('ArrowLeft'); kdown('ArrowLeft');
  assert.ok(/PAGE 1 \/ 4/.test(elements['ov-sub'].innerHTML), 'ArrowLeft walks back to page 1');
});
check('the CONTENTS row is GONE (settled shape 2026-09-18) — no index cards anywhere', () => {
  // HOW-TO-PLAY SETTLED SHAPE (owner: the index buttons are the worst part —
  // "just the forward and back remain"). INVERTED, not deleted: no A RUN /
  // OPTIONS / CONTROLS / FIELD jump cards on ANY page, and PREV/NEXT are the
  // only paging cards — small (.nav), directly under the instructions.
  for (let p = 1; p <= 4; p++) {
    T.manual.goto(p);
    for (const t of ['A RUN', 'OPTIONS', 'FIELD', 'this page']) {
      assert.ok(!cardWith(t), 'no index card ' + t + ' on page ' + p);
    }
    const prev = cardWith('PREV'), next = cardWith('NEXT');
    assert.ok(prev && next, 'PREV/NEXT present on page ' + p);
    assert.ok(prev.classList.contains('nav') && next.classList.contains('nav'),
      'PREV/NEXT carry the small .nav class on page ' + p);
    // Reading order: the instructions card sits ABOVE the nav buttons.
    const ref = cards().find(c => (c.classList && c.classList.contains('ref')) || /class="[^"]*ref/.test(c.className || '') || (c.className || '').includes('ref'));
    assert.ok(ref, 'the instructions card is present on page ' + p);
    assert.ok(cards().indexOf(ref) < cards().indexOf(prev),
      'the nav buttons are UNDERNEATH the instructions on page ' + p);
  }
});
check('state.manualPage is cleared when the manual closes (GOT IT -> title)', () => {
  cardWith('GOT IT').click();
  assert.equal(st.mode, 'title', 'GOT IT returns to the title');
  assert.equal(st.manualPage, null, 'manualPage must reset');
});

// ---- 2. ONE CARD, NOT TWO (the merged CONTROLS page) -------------------------
check('no separate TOUCH or KEYBOARD card exists on ANY page', () => {
  for (let p = 1; p <= 4; p++) {
    T.manual.goto(p);
    assert.ok(!cardWith('TOUCH'), 'no TOUCH card on page ' + p);
    assert.ok(!cardWith('KEYBOARD'), 'no KEYBOARD card on page ' + p);
  }
});
check('the CONTROLS page is ONE card carrying BOTH subheads, KEYS first on a desktop boot', async () => {
  T.manual.goto(3);
  const c = cards().find(k => /YOUR CONTROLS/.test(k.innerHTML || ''));
  assert.ok(c, 'the merged controls card exists');
  const html = c.innerHTML;
  assert.ok(/KEYBOARD/.test(html) && /TOUCH/.test(html), 'both subheads present');
  assert.ok(html.indexOf('KEYBOARD') < html.indexOf('TOUCH'),
    "the DESKTOP boot leads with the keys (the player's own path)");
  // and both sets keep their canonical rows (controls_ref parity)
  const { CONTROLS } = await import('../src/controls_ref.js');
  for (const row of CONTROLS) {
    if (['potion-hp', 'potion-mp', 'stats'].includes(row.id)) continue;
    assert.ok(c.innerHTML.includes(row.purpose), 'controls card lost the purpose of ' + row.id);
  }
});

// ---- 3. HOW A RUN WORKS ------------------------------------------------------
check('page 1 is HOW A RUN WORKS: waves, intermission, the choices, both endings, with numbers', () => {
  T.manual.goto(1);
  const html = cards().map(c => c.innerHTML || '').join('\n');
  for (const tok of ['120s', 'BOSS', 'PORTAL', 'INTERMISSION', 'DRAFT', 'SHRINE',
    'ARCH', 'CHEST', 'CHALLENGE', 'DEATH', 'VICTORY', '40/25/10', '+30%', 'Lv 8']) {
    assert.ok(html.includes(tok), 'HOW A RUN WORKS lost ' + tok);
  }
});

// ---- 4. OPTIONS AND MODES ----------------------------------------------------
check('page 2 is OPTIONS AND MODES: one line each + LIVE callouts read at open time', () => {
  T.manual.goto(2);
  const html = cards().map(c => c.innerHTML || '').join('\n');
  for (const tok of ['PILOT', 'AUTO', 'MANUAL', 'FOCUS', 'NEAREST', 'TOUGHEST', 'SWARM',
    'RANGED', 'STANCE', 'SAFE', 'BALANCED', 'GREEDY']) {
    assert.ok(html.includes(tok), 'OPTIONS AND MODES lost ' + tok);
  }
  // LIVE callouts: the player's CURRENT levers are named from state at open
  // time (never bitmaps, never stale defaults).
  const ctl = T.controller;
  assert.ok(html.includes(String(st.pilotMode)), 'the live pilot mode is named (page lacks ' + st.pilotMode + ')');
  assert.ok(html.includes(ctl.focus), 'the live focus policy is named (' + ctl.focus + ')');
  assert.ok(html.includes(ctl.stance), 'the live stance is named (' + ctl.stance + ')');
});

// ---- 5. GOT IT in the layout --------------------------------------------------
check('GOT IT is a flow footer (no position: sticky - never over content)', () => {
  const m = /#overlay\.howto \.card\.gotit\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'the .gotit rule exists');
  assert.ok(!/position:\s*sticky/.test(m[1]), 'sticky is retired: ' + m[1]);
  assert.ok(/min-height:\s*44px/.test(m[1]), 'GOT IT keeps the 44px floor');
  // and the ONLY scroller is the page body (.ref .desc), not the card stack
  const b = /#overlay\.howto \.card\.ref \.desc\s*\{([^}]*)\}/.exec(css);
  assert.ok(b && /overflow-y:\s*auto/.test(b[1]), 'the body keeps the internal scroll');
});

// ---- 6. THE FIELD from OBJECT_HELP ---------------------------------------------
check('page 4 (THE FIELD) still renders from OBJECT_HELP (one source)', () => {
  T.manual.goto(4);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const t = main.indexOf('const OBJECT_HELP = [');
  const table = main.slice(t, main.indexOf('\n];', t));
  const html = cards().map(c => c.innerHTML || '').join('\n');
  for (const word of ['chests', 'portal', 'arches', 'shrines']) {
    assert.ok(table.includes(word), 'OBJECT_HELP no longer documents ' + word);
    assert.ok(html.includes(word), 'THE FIELD page lost ' + word);
  }
});

console.log('\nmanual v2: ' + passed + ' structure checks + strip geometry above');
