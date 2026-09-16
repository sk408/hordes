// HP/MP CONTROLS READ AS POTIONS (owner 2026-09-16: "we need some way for
// the player to know the HP and mana buttons are potions. Maybe a pixel art
// potion icon?").
//
// WHAT THIS FILE PINS:
//   1. THE ICON — both touch buttons carry a pixel-art vial span ahead of
//      the label (the .key precedent: inline, in the label's line box, so no
//      pad dimension can change — the H1 no-reflow contract). Drawn with the
//      SAME mechanism as the settings cog (pure CSS box-shadow pixels, no
//      new asset pipeline).
//   2. DISTINCT VIALS — health is red, mana is blue, via a --liq custom
//      property per variant; a player does not need the jargon to see two
//      different drinks.
//   3. NOTHING ELSE MOVES — the label (HP / MP) and the counter badge
//      (tc-h / tc-n) survive verbatim; the fixed 64px button height and 96px
//      pad width rules are untouched (source pins).
//   4. THE MANUAL — the HP/MP rows use the word "potion" and say what each
//      one restores (one row each, key named).
//   5. KEYBOARD-PATH CONSISTENCY — the controls_ref rows for the same
//      controls keep the word "potion" in their purpose (one glyph, one
//      meaning, both name sets).
// The GEOMETRY (icon inside the button, clear of the badge and the label at
// the smallest supported size) is measured in a REAL browser by
// tools/verify_help_mobile.mjs's in-run arm — a stub DOM cannot lay out.
// Run: node test/test_potion_icons.mjs
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CONTROLS } from '../src/controls_ref.js';

const s = suite('test_potion_icons');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const touchHtml = html.slice(html.indexOf('<div id="touch">'), html.indexOf('<div id="overlay">'));

// ---- 1+2+3. the touch buttons: vial span + label + badge, CSS pixel art ----
const btn = (act) => {
  const m = new RegExp('<button data-act="' + act + '">(.*?)</button>', 's').exec(touchHtml);
  return m ? m[1] : null;
};
s.check('the HP button carries a .potion.hp vial AHEAD of the label', () => {
  const b = btn('h');
  if (!b) throw new Error('no data-act="h" button in the touch layer');
  if (!/class="potion hp"/.test(b)) throw new Error('no potion hp span: ' + b);
  // AHEAD of the label (the .key precedent — inline in the label line), and
  // the label + the counter badge survive verbatim.
  if (b.indexOf('potion hp') > b.indexOf('HP')) throw new Error('the vial must lead the label: ' + b);
  if (!b.includes('HP')) throw new Error('the HP label is gone: ' + b);
  if (!/class="badge" id="tc-h"/.test(b)) throw new Error('the tc-h counter badge is gone: ' + b);
});
s.check('the MP button carries a .potion.mp vial AHEAD of the label', () => {
  const b = btn('n');
  if (!b) throw new Error('no data-act="n" button in the touch layer');
  if (!/class="potion mp"/.test(b)) throw new Error('no potion mp span: ' + b);
  if (b.indexOf('potion mp') > b.indexOf('MP')) throw new Error('the vial must lead the label: ' + b);
  if (!b.includes('MP')) throw new Error('the MP label is gone: ' + b);
  if (!/class="badge" id="tc-n"/.test(b)) throw new Error('the tc-n counter badge is gone: ' + b);
});
s.check('the vial is the COG mechanism: pure CSS box-shadow pixels, no image assets', () => {
  const m = /#touch \.potion::before\s*\{([^}]*)\}/.exec(html);
  if (!m) throw new Error('no #touch .potion::before rule');
  const body = m[1];
  // Each shadow pixel: "<x> <y> 0 <color>" (x/y may be a unitless 0).
  const shadows = (body.match(/(?:-?\d+px|0) (?:-?\d+px|0) 0(?:px)? (?:#|var)/g) || []).length;
  if (shadows < 12) throw new Error('the pixel map is too thin to read as a vial (' + shadows + ' shadow pixels)');
  if (!/var\(--liq/.test(body)) throw new Error('the liquid must be the --liq custom property: ' + body);
  if (/url\(/.test(html.slice(html.indexOf('#touch .potion'), html.indexOf('#touch .potion') + 600))) {
    throw new Error('no image assets on this layer (cog precedent)');
  }
});
s.check('two DISTINCT vials: health red, mana blue (distinct --liq values)', () => {
  const hp = /#touch \.potion\.hp\s*\{([^}]*)\}/.exec(html);
  const mp = /#touch \.potion\.mp\s*\{([^}]*)\}/.exec(html);
  if (!hp || !mp) throw new Error('missing .potion.hp / .potion.mp variant rules');
  const liq = (m) => (/--liq:\s*(#[0-9a-fA-F]{6})/.exec(m[1]) || [])[1];
  const r = liq(hp), b = liq(mp);
  if (!r || !b) throw new Error('variants must set --liq hex colors');
  if (r === b) throw new Error('the vials must be visually distinct (' + r + ' == ' + b + ')');
  // Red vs blue, by channel: hp's red channel dominates its blue; mp's the reverse.
  const ch = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  if (!(ch(r)[0] > ch(r)[2] && ch(b)[2] > ch(b)[0])) {
    throw new Error('health must read red and mana blue (hp ' + r + ', mp ' + b + ')');
  }
});
s.check('the icon lives INLINE in the label line — no pad dimension can change (H1)', () => {
  const m = /#touch \.potion\s*\{([^}]*)\}/.exec(html);
  if (!m) throw new Error('no #touch .potion rule');
  if (!/display:\s*inline-block/.test(m[1])) throw new Error('the vial must be inline-block (the .key precedent): ' + m[1]);
  if (!/width:\s*12px/.test(m[1]) || !/height:\s*16px/.test(m[1])) {
    throw new Error('the vial must carry its own fixed box (12x16px): ' + m[1]);
  }
  // The fixed geometry rules the pad math is written against are untouched.
  if (!/#touch \.pad button \{[^}]*height:\s*64px/.test(html)) throw new Error('the 64px pad button height is gone');
  if (!/#touch \.pad \{[^}]*width:\s*96px/.test(html)) throw new Error('the 96px pad width is gone');
  if (!/#touch \.pad button \{[^}]*box-sizing:\s*border-box/.test(html)) throw new Error('the border-box rule is gone');
});

// ---- 4. the manual: the word "potion" + what each restores ------------------
const { T, elements, pump } = await boot({ storage: [['hordes_onboarded', '1']] });
const cards = () => [...elements['ov-cards'].children];
{
  T.startRun(); pump(3);
  T.openSettings();
  const howto = cards().find(c => (c.innerHTML || '').includes('HOW TO PLAY'));
  if (!howto) throw new Error('no HOW TO PLAY entry in-run');
  howto.click(); pump(2);
  let refHtml = '';
  for (let p = 1; p <= 4; p++) { T.manual.goto(p); refHtml += cards().map(c => c.innerHTML || '').join('\n') + '\n'; }
  s.check('the manual rows say POTION and what each one restores (H heals, N refuels)', () => {
    if (!/health potion[^<]*heal/i.test(refHtml) && !/health potion[^<]*restor/i.test(refHtml)) {
      throw new Error('no health-potion row saying what it restores');
    }
    if (!/mana potion[^<]*(refuel|restor)/i.test(refHtml)) {
      throw new Error('no mana-potion row saying what it restores');
    }
    // The KEY is named on each row (one glyph, one meaning — parity with the
    // keyboard path).
    if (!/>H</.test(refHtml) || !/>N</.test(refHtml)) {
      throw new Error('the H / N keys must stay named on the potion rows');
    }
  });
  s.check('the counter badges still read the live potion counts (behaviour untouched)', () => {
    T.startRun(); pump(5);
    const h = elements['tc-h'], n = elements['tc-n'];
    if (!h || !n) throw new Error('tc-h / tc-n badge elements missing');
    if (h.textContent !== String(T.state.player.potions.hp)) {
      throw new Error('tc-h reads ' + h.textContent + ' want ' + T.state.player.potions.hp);
    }
    if (n.textContent !== String(T.state.player.potions.mp)) {
      throw new Error('tc-n reads ' + n.textContent + ' want ' + T.state.player.potions.mp);
    }
  });
}

// ---- 5. keyboard-path consistency (controls_ref keeps the word "potion") ----
s.check('the controls_ref rows keep "potion" in both purposes (one glyph, one meaning)', () => {
  for (const id of ['potion-hp', 'potion-mp']) {
    const row = CONTROLS.find(c => c.id === id);
    if (!row) throw new Error('controls_ref lost ' + id);
    if (!/potion/i.test(row.purpose)) throw new Error(id + ' purpose dropped the word potion: ' + row.purpose);
    if (!row.touch || !row.keys.length) throw new Error(id + ' lost its keys/touch names');
  }
});

s.done();
