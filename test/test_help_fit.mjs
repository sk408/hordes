// HELP POPUPS MUST FIT THE MOBILE VIEWPORT (owner 2026-09-16: "The ? Tap
// works as intended now but the popups are too wide for mobile screen.").
//
// This file pins the SHARED RULE the task demands — not a one-element patch:
// ONE clamp helper (a --fit-w custom property = 100vw - 2*margin, defined
// once) that every help surface's width goes through (the #help-tip
// explainer popup, the #help-hud leave strip, the manual's .ref pages and
// its .gotit footer), so a future help surface cannot reintroduce the
// defect without opting out of the helper. The GEOMETRY itself (bounding
// boxes at 320x568 / 360x800 / 390x844 / 568x320, real taps) is measured
// in a REAL browser by tools/verify_help_fit.mjs — a stub DOM cannot lay
// text out. What is pinned here:
//   1. the ONE clamp definition and every help surface referencing it;
//   2. the nowrap retirement: the explainer WRAPS inside its box (the old
//      white-space: nowrap is what pushed a long line past both edges);
//   3. no inline sizing in showHelpTip fights the clamp;
//   4. BEHAVIOUR (touch device, real seams): arming help mode and probing
//      a control mounts the tip with the TOUCH wording, and the tap
//      explains rather than activates (stance unchanged) — the fit work
//      must not regress the mode it resizes.
// Run: node test/test_help_fit.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { introLine } from '../src/controls_ref.js';

const s = suite('test_help_fit');
const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

// ---- 1. THE ONE SHARED CLAMP -----------------------------------------------------
s.check('ONE shared viewport clamp exists: --fit-w = calc(100vw - 2*margin), defined exactly once', () => {
  const defs = [...css.matchAll(/--fit-w:\s*([^;}]+)[;}]/g)];
  assert.equal(defs.length, 1, defs.length + ' --fit-w definitions — the clamp must be ONE helper');
  assert.ok(/calc\(100vw\s*-\s*2\s*\*\s*var\(--fit-margin\)\)/.test(defs[0][1]),
    'the clamp must be 100vw minus both margins: ' + defs[0][1]);
  assert.ok(/--fit-margin:\s*\d+px/.test(css), 'no --fit-margin definition');
});
s.check('the explainer popup AND the leave strip clamp through the shared helper', () => {
  const m = /#help-hud,\s*#help-tip\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'no #help-hud, #help-tip rule');
  assert.ok(/max-width:\s*min\([^;]*var\(--fit-w\)[^;]*\)/.test(m[1]),
    'the tips must cap at min(design width, var(--fit-w)): ' + m[1]);
});
s.check('the manual .ref pages clamp through the SAME helper (not their own rule)', () => {
  const m = /#overlay\.howto \.card\.ref\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'no .ref rule');
  assert.ok(/var\(--fit-w\)/.test(m[1]), 'the manual page must reference --fit-w: ' + m[1]);
});
s.check('the manual GOT IT footer clamps through the SAME helper', () => {
  const m = /#overlay\.howto \.card\.gotit\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'no .gotit rule');
  assert.ok(/var\(--fit-w\)/.test(m[1]), 'GOT IT must reference --fit-w: ' + m[1]);
});

// ---- 2. THE NOWRAP RETIREMENT ----------------------------------------------------
s.check('the explainer WRAPS inside its box (white-space: nowrap is gone from both tips)', () => {
  const m = /#help-hud,\s*#help-tip\s*\{([^}]*)\}/.exec(css);
  assert.ok(!/white-space:\s*nowrap/.test(m[1]),
    'nowrap is what pushed a long line past both screen edges: ' + m[1]);
  assert.ok(/box-sizing:\s*border-box/.test(m[1]),
    'padding must live INSIDE the clamped width or the box still spills: ' + m[1]);
  assert.ok(/width:\s*max-content/.test(m[1]),
    'without max-content the abs-pos shrink-to-fit at left:50% folds the box to the remaining half-viewport: ' + m[1]);
});

// ---- 3. NO INLINE SIZING FIGHTS THE CLAMP ---------------------------------------
// RETARGETED 2026-09-17 (disclosed, help-card placement task): showHelpTip now
// takes an anchor and delegates PLACEMENT to placeHelpTip, which may write an
// inline maxWidth — but only as a rung <= the stylesheet's computed clamp (the
// card can wrap earlier, never wider). What stays pinned: showHelpTip itself
// writes no width/white-space, and placeHelpTip seeds its ladder from the
// COMPUTED max-width (the clamp stays the width authority). The real geometry
// is measured by tools/verify_help_clearance.mjs.
s.check('showHelpTip writes no width/white-space inline (nothing fights the CSS clamp)', () => {
  const m = /function showHelpTip\(html[^)]*\)\s*\{([^}]*)\}/.exec(js);
  assert.ok(m, 'no showHelpTip');
  assert.ok(!/\.style\.width|\.style\.whiteSpace/.test(m[1]), m[1]);
});
s.check('placement never widens past the clamp: the ladder seeds from the COMPUTED max-width', () => {
  const m = /function placeHelpTip\(anchor\)\s*\{/.exec(js);
  assert.ok(m, 'no placeHelpTip');
  const body = js.slice(m.index, m.index + 2500);
  assert.ok(/getComputedStyle\(el\)\.maxWidth/.test(body),
    'the width ladder must read the stylesheet clamp, not invent widths');
  assert.ok(/cssMax = Math\.min\(cssMax, m\)/.test(body),
    'every rung cap must be clamped to the stylesheet value');
});

// ---- 4. BEHAVIOUR on a TOUCH DEVICE (the fit work must not regress the mode) ----
const { T, state: st, elements, pump } = await boot({ device: 'touch', variant: 'helpfit',
  storage: [['hordes_onboarded', '1']] });
{
  T.startRun();
  for (let i = 0; i < 2; i++) pump(1);
  const stanceBadgeBefore = elements['tc-stance'].textContent;
  T.runAction('help');
  assert.ok(st.helpMode, 'the button arms help mode');
  // The REAL pointer seam (the same routing a phone tap takes): probing the
  // STANCE pad button explains it — the LONGEST controls_ref line, the one
  // that overflowed 320/360/390 — and activates nothing.
  elements['touch']._ev['pointerdown']({
    preventDefault() {}, pointerId: 81, clientX: 0, clientY: 0,
    target: {
      closest: (sel) => (sel === '[data-joy]') ? null
        : (sel === '[data-act]' ? { dataset: { act: 'stance' } } : null),
    },
  });
  const tip = elements['help-tip'];
  s.check('probing a control mounts the explainer with the TOUCH wording (longest line)', () => {
    assert.equal(tip.style.display, 'block', 'the tip is shown');
    assert.equal(tip.innerHTML, introLine('stance', true), tip.innerHTML);
    assert.notEqual(tip.innerHTML, introLine('stance', false), 'the keyboard wording must not show');
  });
  s.check('the tap EXPLAINS, it does not activate (stance unchanged, mode still armed)', () => {
    assert.ok(st.helpMode, 'help mode must survive a probe');
    assert.equal(elements['tc-stance'].textContent, stanceBadgeBefore,
      'the probe toggled the stance: ' + elements['tc-stance'].textContent);
  });
  T.runAction('help');   // leave
  assert.ok(!st.helpMode, 'the button leaves help mode');
}

s.done();
