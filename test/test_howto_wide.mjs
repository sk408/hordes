// HOW TO PLAY — WIDESCREEN LAYOUT (owner 2026-09-18: "the desktop layout for
// how to play still needs work on a widescreen. the navigation and got it
// buttons should be underneath the how a run works panel"). The wide-viewport
// rule: the panel IS the page, the controls are ONE row UNDER it (PREV, NEXT,
// GOT IT, REPLAY TOUR — no more control columns beside the text), and the
// PAGE n / N indicator rides with that row (the subtitle's .pgline is hidden
// by the same query). A stub DOM cannot lay text out — the real bounding
// boxes at 1280x720 / 1600x900 (rule holds) and 390x844 / 320x568 (phone
// flow untouched) are measured in a REAL browser by
// tools/verify_howto_wide.mjs. What is pinned here:
//   1. the wide query exists and carries every piece of the rule (panel takes
//      its line, desc scroll cap off, pgline hidden, .howto-page shown, GOT
//      IT auto-width, REPLAY TOUR ordered into the row);
//   2. the phone rules OUTSIDE the query are untouched (indicator hidden,
//      .gotit/.nav clamp + 44px floors as before);
//   3. DOM SOURCE: manualGoto parks the .howto-page marker in the card flow
//      between the panel and PREV (NOT a card — no frame, no click), tracks
//      the page, and the subtitle's indicator text rides the .pgline span.
// Run: node test/test_howto_wide.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';

const s = suite('test_howto_wide');
const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ---- 1. THE WIDE QUERY ------------------------------------------------------------
const qm = /@media \(min-width: 860px\) \{([\s\S]*?)\n  \}/.exec(css);
s.check('the wide query exists (min-width: 860px — never matches a phone)', () => {
  assert.ok(qm, 'no @media (min-width: 860px) block');
});
const wide = qm ? qm[1] : '';
s.check('WIDE: the subtitle page line (.pgline) is hidden — the indicator moves down', () => {
  assert.ok(/#overlay\.howto \.sub \.pgline\s*\{\s*display:\s*none/.test(wide), wide);
});
s.check('WIDE: the panel takes its whole line (flex 0 0 100%, no cap beside it)', () => {
  const m = /#overlay\.howto \.card\.ref\s*\{([^}]*)\}/.exec(wide);
  assert.ok(m, 'no wide .ref rule');
  assert.ok(/flex:\s*0 0 100%/.test(m[1]), 'the panel must take its own line: ' + m[1]);
  assert.ok(/max-width:\s*none/.test(m[1]),
    'a cap is what let the controls wedge BESIDE the panel: ' + m[1]);
});
s.check('WIDE: the panel scroll cap comes OFF (no scrollbar when the text fits)', () => {
  const m = /#overlay\.howto \.card\.ref \.desc\s*\{([^}]*)\}/.exec(wide);
  assert.ok(m, 'no wide .desc rule');
  assert.ok(/max-height:\s*none/.test(m[1]), m[1]);
});
s.check('WIDE: the marker (.howto-page) is shown and ordered into the controls row', () => {
  const m = /#overlay\.howto \.howto-page\s*\{([^}]*)\}/.exec(wide);
  assert.ok(m, 'no wide .howto-page rule');
  assert.ok(/display:\s*block/.test(m[1]) && /order:\s*6/.test(m[1]), m[1]);
});
s.check('WIDE: the controls are one row under the panel — nav, then GOT IT (auto width, 44px floor), then REPLAY TOUR', () => {
  const nav = /#overlay\.howto \.card\.nav\s*\{\s*([^}]*)order:\s*3/.exec(wide);
  const got = /#overlay\.howto \.card\.gotit\s*\{([^}]*)\}/.exec(wide);
  const rep = /#overlay\.howto \.card\.replay\s*\{([^}]*)\}/.exec(wide);
  assert.ok(nav, 'no wide .nav order rule');
  assert.ok(got && /order:\s*4/.test(got[1]) && /width:\s*auto/.test(got[1]) &&
    /min-height:\s*44px/.test(got[1]), 'GOT IT: ' + (got && got[1]));
  assert.ok(rep && /order:\s*5/.test(rep[1]), 'REPLAY TOUR: ' + (rep && rep[1]));
});

// ---- 2. THE PHONE RULES OUTSIDE THE QUERY ARE UNTOUCHED ----------------------------
s.check('PHONE: the marker is hidden outside the query (phones keep the subtitle line)', () => {
  const m = /#overlay\.howto \.howto-page\s*\{\s*display:\s*none;\s*\}/.exec(css);
  assert.ok(m, 'no default #overlay.howto .howto-page { display: none } rule');
});
s.check('PHONE: the base .gotit / .nav clamp + 44px floors are as before', () => {
  const got = /#overlay\.howto \.card\.gotit\s*\{([^}]*)\}/.exec(css);
  const nav = /#overlay\.howto \.card\.nav\s*\{([^}]*)\}/.exec(css);
  assert.ok(got && /min-height:\s*44px/.test(got[1]) && /var\(--fit-w\)/.test(got[1]),
    'base GOT IT: ' + (got && got[1]));
  assert.ok(nav && /min-height:\s*44px/.test(nav[1]) && /width:\s*118px/.test(nav[1]),
    'base nav: ' + (nav && nav[1]));
});

// ---- 3. DOM SOURCE: the marker in the card flow -----------------------------------
const { T, state: st, elements, pump, key } = await boot({ storage: [['hordes_onboarded', '1']] });
const cards = () => [...elements['ov-cards'].children];
const kdown = (k) => key('keydown', { key: k, preventDefault() {} });

for (let i = 0; i < 60 * 12 && cards().length === 0; i++) pump(1);
const howTo = cards().find(c => (c.innerHTML || '').includes('>HOW TO PLAY<'));
assert.ok(howTo, 'must boot to the title with a HOW TO PLAY card');
howTo.click();

s.check('page 1: the .howto-page marker sits BETWEEN the panel and PREV, and is not a card', () => {
  const kids = cards();
  // (the stub DOM's classList.add does not reflect into className strings,
  // so the panel is found by its page title, not by the .ref class)
  const iRef = kids.findIndex(c => /HOW A RUN WORKS/.test(c.innerHTML || ''));
  const iInd = kids.findIndex(c => c.className === 'howto-page');
  const iPrev = kids.findIndex(c => (c.innerHTML || '').includes('>PREV<'));
  assert.ok(iRef === 0 && iInd === 1, 'marker must directly follow the panel: ' +
    JSON.stringify(kids.map(k => k.className)));
  assert.ok(iPrev > iInd, 'PREV must follow the marker');
  const ind = kids[iInd];
  assert.ok(!(ind.className || '').includes('card'), 'the marker is never a card');
  assert.ok(!ind.onclick, 'the marker is not clickable');
});
s.check('the marker text is the page indicator and tracks page turns', () => {
  const ind = () => cards().find(c => c.className === 'howto-page');
  assert.equal(ind().textContent, 'PAGE 1 / 4 — HOW A RUN WORKS', ind().textContent);
  cards().find(c => (c.innerHTML || '').includes('>NEXT<')).click();
  assert.equal(ind().textContent, 'PAGE 2 / 4 — OPTIONS AND MODES', ind().textContent);
});
s.check('the subtitle carries the SAME indicator in a .pgline span (the phone rendering)', () => {
  const sub = elements['ov-sub'].innerHTML;
  assert.ok(/<span class="pgline">PAGE 2 \/ 4 — OPTIONS AND MODES<\/span>/.test(sub), sub);
});
s.check('REPLAY TOUR is classed for the wide row; the gate context still omits it', () => {
  const rep = cards().find(c => (c.innerHTML || '').includes('>REPLAY TOUR<'));
  assert.ok(rep && rep.classList && rep.classList.contains('replay'),
    'REPLAY TOUR must carry the .replay class (stub: read via classList)');
  // helpFrom 'gate' (the fresh-profile door) never offers the replay.
  st.helpFrom = 'gate';
  T.manual.goto(1);
  assert.ok(!cards().some(c => (c.innerHTML || '').includes('>REPLAY TOUR<')),
    'the gate context must not offer REPLAY TOUR');
});

if (s.done() > 0) process.exit(1);
