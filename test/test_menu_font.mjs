// THE MENUS' TYPE AND READABILITY (R5 "a clear main PLAY button, readable
// hint contrast"; round 8 "font2": the pixel font is gone, Steve found it
// harder to read). index.html, src/art/menu_frame.js, the title's PLAY.
//   1. no web font: none on disk, none precached, none asked for by the code
//      or the page; every menu is in the page's monospace at its own sizes;
//   2. one main button on the title (PLAY): its own frame tone, a bigger name;
//   3. hint and dim text reaches 4.5:1 against its background;
//   4. the draft's rows on an upright phone (cards2) are still the layout.
// Run: node test/test_menu_font.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_FRAME_PALETTES } from '../src/art/menu_frame.js';
import { draftLayout } from '../src/draft_card_art.js';
import { boot } from './_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const html = read('index.html');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const srcFiles = [];
const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
  const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) srcFiles.push(p); } };
walk('src');

// ---- 1. no web font --------------------------------------------------------------------
const FONT_FILE = /\.(woff2?|ttf|otf|eot)\b/i;
ok('no font file ships: assets/fonts is gone and nothing in assets is a font', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'assets/fonts')), 'assets/fonts is removed');
  const bad = [];
  const scan = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const p = d + '/' + e.name; if (e.isDirectory()) scan(p); else if (FONT_FILE.test(p)) bad.push(p); } };
  scan('assets');
  assert.deepEqual(bad, []);
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/menu_font.js')), 'the font loader is removed');
});
ok('sw.js precaches no font', () => {
  const sw = read('sw.js');
  assert.ok(!FONT_FILE.test(sw), 'no font file in the precache list');
  assert.ok(!/menu_font/.test(sw));
});
ok('the page and the code ask for no web font', () => {
  assert.ok(!/@font-face/.test(html), 'no @font-face');
  assert.ok(!/<link[^>]+font/i.test(html), 'no font link or preload');
  assert.ok(!/px-font|Pixelify/i.test(html), 'no rules for the pixel font');
  for (const f of srcFiles) {
    const t = read(f);
    assert.ok(!/\bFontFace\b|document\.fonts|Pixelify|menu_font/.test(t), f + ' asks for a font');
    assert.ok(!FONT_FILE.test(t.replace(/\/\/.*$/gm, '')), f + ' names a font file');
  }
});
ok('no code rewrites the stylesheet\'s font sizes at run time', () => {
  for (const f of srcFiles) assert.ok(!/styleSheets/.test(read(f)), f + ' walks the stylesheets');
});
ok('menus use the page\'s monospace: body says monospace and no rule sets another family', () => {
  assert.match(css, /html, body \{[^}]*font-family: monospace;/);
  const fams = [...css.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(fams.length >= 1);
  for (const f of fams) assert.match(f, /^monospace$|^inherit$/, 'font-family ' + f);
  for (const m of css.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)) assert.match(m[1], /monospace|inherit/, 'font: ' + m[1]);
});
ok('the glyphs the pixel font lacked are back: the name caret, the away-rows bullet, the help arrow', () => {
  assert.match(css, /\.card \.name::before \{\s*content: '\\2023';/);
  assert.match(css, /#overlay \.away-rows div::before \{ content: '\\25B8  ';/);
  // the draft's playing cards keep no caret: it sat on their number ("1. Whetstone")
  assert.match(css, /(?:^|\n)[ \t]*\.card\.dcard \.name::before \{ content: none; \}/);
  assert.match(read('src/main.js'), /refRow\('auto &harr; manual', 'PILOT'\)/);
});
ok('the shop\'s buy line shrinks to fit again (9 to 12 px), as before the font', () => {
  assert.match(read('src/main.js'), /const fs = Math\.max\(9, Math\.min\(12, Math\.floor\(\(gridPlan\.cardW - 16\) \/ \(0\.6 \* maxCh\)\)\)\);/);
  assert.match(css, /\.card \.desc \.buy \{[^}]*font-size: var\(--shop-buy-fs, 12px\);/);
});

const h = await boot({ storage: [['hordes_onboarded', '1']] });
h.pump(2);

// ---- 5. one main button ---------------------------------------------------------------------
h.pump(3);
h.key('keydown', { key: 'Escape', preventDefault() {} });
h.pump(30);
h.T.menus.showTitle();
ok('the title has ONE main button and it is PLAY; its frame tone is its own', () => {
  const cards = h.elements['ov-cards'].children;
  const mains = cards.filter((c) => /\bmain\b/.test(c.className || ''));
  assert.equal(mains.length, 1);
  assert.match(mains[0].innerHTML, /class="name">PLAY</);
  assert.ok(MENU_FRAME_PALETTES.main);
  assert.notDeepEqual(MENU_FRAME_PALETTES.main, MENU_FRAME_PALETTES.base);
  assert.notDeepEqual(MENU_FRAME_PALETTES.main, MENU_FRAME_PALETTES.sel);
  assert.match(read('src/main.js'), /\/\\bmain\\b\/\.test\(cls\) \? 'main' : 'base'/);
});
ok('PLAY reads bigger and brighter than the other tiles: a larger name and a lighter plank', () => {
  const m = /#overlay\.title \.card\.main \.name \{ font-size: (\d+)px;/.exec(css);
  assert.ok(m, 'PLAY has its own name size');
  // the other tiles' names inherit the page size (16 px): nothing sets one
  assert.ok(!/(?:^|\n)[ \t]*\.card \.name \{[^}]*font-size/.test(css), '.card .name keeps the page size');
  assert.ok(+m[1] >= 20, 'PLAY\'s name ' + m[1] + ' px is clearly larger than 16 px');
  const hx = (s) => { s = s.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
  const L = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  assert.ok(L(hx(MENU_FRAME_PALETTES.main[6])) > L(hx(MENU_FRAME_PALETTES.base[6])), 'a lighter plank');
  assert.ok(L(hx(MENU_FRAME_PALETTES.main[3])) > L(hx(MENU_FRAME_PALETTES.base[3])), 'a brighter frame');
  assert.match(css, /@media \(pointer: coarse\) and \(orientation: landscape\) \{[\s\S]*?#overlay\.title \.card\.main \{ width: min\(24vw, 210px\); margin: 0;/,
    'a sideways phone: PLAY leads the first row');
});
h.T.menus.showSettings();
ok('no other screen has a main button', () => {
  assert.equal(h.elements['ov-cards'].children.filter((c) => /\bmain\b/.test(c.className || '')).length, 0);
});
ok('the galleries mark the overlay so their caption gets a backing; the next screen drops the mark', () => {
  const ov = h.elements.overlay;
  const has = () => (ov.classList && typeof ov.classList.contains === 'function') ? ov.classList.contains('showcase') : /\bshowcase\b/.test(ov.className || '');
  h.T.menus.showTitle();
  h.T.openTrophies();
  assert.equal(h.T.state.mode, 'trophies');
  assert.ok(has(), 'trophies');
  h.T.closeTrophies(); h.T.menus.showTitle();
  assert.ok(!has(), 'the title has no backing');
  const main = read('src/main.js');
  assert.equal(main.match(/overlay\.style\.justifyContent = 'flex-end';\r?\n {2}if \(overlay\.classList\) overlay\.classList\.add\('showcase'\);/g).length, 3, 'trophies, bestiary, apex');
});

// ---- 6. contrast ----------------------------------------------------------------------------------
const hex = (s) => { s = s.replace('#', ''); if (s.length === 3) s = [...s].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rule = (sel) => {
  const m = new RegExp('(?:^|\\n)[ \\t]*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{').exec(css);
  assert.ok(m, 'rule ' + sel); return css.slice(m.index, css.indexOf('}', m.index));
};
const colorOf = (sel) => { const m = /(?:^|[;{\s])color:\s*(#[0-9a-fA-F]{3,6})/.exec(rule(sel)); assert.ok(m, 'colour of ' + sel); return hex(m[1]); };
const opOf = (sel) => { const m = /opacity:\s*([\d.]+)/.exec(rule(sel)); return m ? +m[1] : 1; };
// The backgrounds: the plaque's plank, the menu scrim over a light stage
// floor (the lightest a menu sits on), the draft scrim over the same, the
// tour tip, the AUTO-PICK switch, a draft action button and the parchment's
// darkest stop.
const PLANK = hex(MENU_FRAME_PALETTES.base[6]);
const FLOOR = hex('#808080');
const MENU_BG = mix([5, 5, 10], FLOOR, 0.75), DRAFT_BG = mix([5, 5, 10], FLOOR, 0.88);
const PAIRS = [
  ['.card .desc on the plank', colorOf('.card .desc'), PLANK],
  ['.card .key (press hint) on the plank', colorOf('.card .key'), PLANK],
  ['#overlay .sub on the menu scrim', colorOf('#overlay .sub'), MENU_BG],
  ['#draft-autopick (countdown) on the draft scrim', colorOf('#draft-autopick'), DRAFT_BG],
  ['#draft-autopick .k at its opacity on the switch', mix(colorOf('#draft-autopick .dap'), hex('#12121c'), opOf('#draft-autopick .k')), hex('#12121c')],
  ['#draft-actions .dact.dim on its button', colorOf('#draft-actions .dact.dim'), hex('#241c14')],
  ['#tour-tip .tour-count on the tip', colorOf('#tour-tip .tour-count'), hex('#14141f')],
  ['#tour-tip .tour-replay on the tip', colorOf('#tour-tip .tour-replay'), hex('#14141f')],
  ['.dcard .fx.dim on the plank', colorOf('.dcard .fx.dim'), PLANK],
  ['.card.paper-note .name on the parchment', colorOf('.card.paper-note .name'), hex('#d2ba88')],
  ['.card.paper-note .desc on the parchment', colorOf('.card.paper-note .desc'), hex('#d2ba88')],
  ['.card.paper-note .key on the parchment', colorOf('.card.paper-note .key'), hex('#d2ba88')],
  ['stats page: the muted hint (#9a9ab8) on the plank', hex('#9a9ab8'), PLANK],
  ['stats page: a red suit not in the hand', hex('#c88080'), PLANK],
  ['stats page: a black suit not in the hand', hex('#9aa3b8'), PLANK],
];
// A dim card: the frame (and its plank) stays solid, only darker, so the
// screen's art never shows through behind the text; the text at its own
// opacity over that.
ok('a dim card fades its pictures, never its frame: the plank stays solid behind the text', () => {
  assert.equal(opOf('.card.dim canvas.frame'), 1, 'the frame keeps full opacity');
  assert.match(rule('.card.dim canvas:not(.frame)'), /opacity: 0\.5;/);
  assert.ok(!/(?:^|\n)[ \t]*\.card\.dim canvas \{/.test(css), 'no rule fades every canvas of a dim card');
  assert.ok(!/(?:^|\n)[ \t]*\.card\.dim \{[^}]*opacity/.test(css), 'no rule fades the whole dim card (frame and text with it)');
  assert.match(rule('.card.dim canvas.frame'), /filter: brightness\(0?\.\d+\)/);
});
{
  const b = +/brightness\(([\d.]+)\)/.exec(rule('.card.dim canvas.frame'))[1];
  const sm = +/saturate\(([\d.]+)\)/.exec(rule('.card.dim canvas.frame'))[1];
  // The CSS filter as Chrome applies it: brightness, then saturate (the
  // spec's matrix), both on sRGB values. Checked against the real pixels:
  // the frame's shade step #8a5a2a comes out as about 75,55,35 in Chrome.
  const dimFrame = (c) => {
    const [r, g, bl] = c.map((v) => v * b);
    const S = [[0.213 + 0.787 * sm, 0.715 - 0.715 * sm, 0.072 - 0.072 * sm],
      [0.213 - 0.213 * sm, 0.715 + 0.285 * sm, 0.072 - 0.072 * sm],
      [0.213 - 0.213 * sm, 0.715 - 0.715 * sm, 0.072 + 0.928 * sm]];
    return S.map((row) => Math.min(255, row[0] * r + row[1] * g + row[2] * bl));
  };
  const plankDim = dimFrame(PLANK);
  const tOp = opOf('.card.dim .name, .card.dim .desc, .card.dim .syn, .card.dim .key');
  PAIRS.push(['a dim card\'s description', mix(colorOf('.card .desc'), plankDim, tOp), plankDim]);
  PAIRS.push(['a dim card\'s name', mix(colorOf('.card .name'), plankDim, tOp), plankDim]);
  // polish P9b: the key chip on a dim card is why .card .key is #b0b0cc.
  PAIRS.push(['a dim card\'s key chip', mix(colorOf('.card .key'), plankDim, tOp), plankDim]);
  // The key chip [1] on a focused card sits on the hot frame's plank grain
  // (its lighter plank step): #9a9ab8 was 4.35 to 1 there, #b0b0cc is 5.61.
  PAIRS.push(['.card .key on a focused card\'s plank grain', colorOf('.card .key'), hex(MENU_FRAME_PALETTES.hot[7])]);
  // On a sideways phone the pre-run's cards have 5 px of padding, so a line
  // of text runs onto the frame's shade step (the brightest dark the frame
  // has under text; measured over the real pixels by tools/verify_menu_font.mjs).
  const shade = dimFrame(hex(MENU_FRAME_PALETTES.base[5]));
  PAIRS.push(['a dim card\'s description over the frame\'s shade step', mix(colorOf('.card .desc'), shade, tOp), shade]);
}
// The galleries' caption over the picture: its backing over the lightest
// art (white) is the worst case.
{
  const g = rule('#overlay.showcase > h1, #overlay.showcase > .sub');
  const m = /background: rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(g);
  assert.ok(m, 'the gallery caption has a backing');
  const back = mix([+m[1], +m[2], +m[3]], [255, 255, 255], +m[4]);
  PAIRS.push(['a gallery\'s sub line on its backing over white art', colorOf('#overlay .sub'), back]);
  PAIRS.push(['a gallery\'s LOCKED / name heading on its backing over white art', hex('#e8e8f0'), back]);
}
// integ3: the light stage floors. Whiteout's floor is about #ced5e1 (the
// lightest a run's menu sits on). The in-run menus darken their scrim there
// (#overlay.floor-light), and the evolve offer's grey lines sit on a plate
// over its lighter 0.62 scrim.
{
  const WHITE_FLOOR = hex('#ced5e1');
  const alpha = (sel) => { const m = /background: rgba\(5,\s*5,\s*10,\s*([\d.]+)\)/.exec(rule(sel)); assert.ok(m, 'a scrim on ' + sel); return +m[1]; };
  const lightMenu = mix([5, 5, 10], WHITE_FLOOR, alpha('#overlay.floor-light:not(.title):not(.draft):not(.end)'));
  PAIRS.push(['#overlay .sub (pause, intermission) on the light-floor scrim over Whiteout', colorOf('#overlay .sub'), lightMenu]);
  const forgeField = mix([5, 5, 10], WHITE_FLOOR, alpha('#overlay.draft.forge'));
  const plate = mix([5, 5, 10], forgeField, alpha('#overlay.draft.forge .sub, #overlay.draft.forge #draft-autopick'));
  PAIRS.push(['the evolve offer\'s sub line on its plate over Whiteout', colorOf('#overlay .sub'), plate]);
  PAIRS.push(['the evolve offer\'s AUTO-PICK countdown on its plate over Whiteout', colorOf('#draft-autopick'), plate]);
  PAIRS.push(['a key chip [U] [T] on the AUTO-PICK switch', colorOf('#draft-autopick .k'), hex('#12121c')]);
}
ok('hint and dim text reaches 4.5:1 against its background (' + PAIRS.length + ' pairs)', () => {
  const low = PAIRS.map(([n, a, b]) => [n, ratio(a, b)]).filter(([, r]) => r < 4.5);
  assert.deepEqual(low.map(([n, r]) => n + ' ' + r.toFixed(2)), []);
});
ok('no #6a6a8a hint text is left in the menus', () => {
  assert.ok(!/color:\s*#6a6a8a/.test(read('src/main.js')));
  for (const sel of ['#draft-autopick', '.card .key', '#tour-tip .tour-count', '#tour-tip .tour-replay']) assert.notDeepEqual(colorOf(sel), hex('#6a6a8a'), sel);
});


// ---- 4. the draft's rows on an upright phone ---------------------------------------------
ok('an upright phone still gets the draft as rows (cards2), a desktop does not', () => {
  for (const [w, hh] of [[390, 844], [375, 667]]) assert.equal(draftLayout(w, hh, 3, { dcard: true }).rows, true, w + 'x' + hh);
  assert.ok(!draftLayout(1280, 720, 3, { dcard: true }).rows);
  assert.match(css, /#overlay\.draft\.rows \.card\.dcard \.name \{ font-size: 14px;/);
});
// Every @media block of the page's style, by its head (one entry per block).
const mediaBlocks = (head) => {
  const out = [];
  for (let i = css.indexOf(head); i >= 0; i = css.indexOf(head, i + 1)) {
    let depth = 0, j = css.indexOf('{', i);
    for (let k = j; k < css.length; k++) { if (css[k] === '{') depth++; else if (css[k] === '}' && --depth === 0) { out.push(css.slice(j + 1, k)); break; } }
  }
  return out;
};
ok('the end card on a short upright phone is tightened by spacing and card widths, never by text size', () => {
  const m = mediaBlocks('@media (orientation: portrait) and (max-height: 700px)').find((b) => b.includes('#overlay.end'));
  assert.ok(m, 'the short upright phone rule for the end card');
  assert.match(m, /#overlay\.end \{ gap: 8px;/);
  assert.match(m, /#overlay\.end \.card, #overlay\.end \.cards > \.card\.endbuy \{ box-sizing: border-box; width: calc\(50% - 4px\);/);
  assert.ok(!/font-size|font:/.test(m), 'no text gets smaller');
  // after the upright-phone rule, so its spacing wins
  assert.ok(css.indexOf(m) > css.indexOf('@media (orientation: portrait) and (max-width: 600px)'), 'comes after the max-width 600px rule');
  const tiny = mediaBlocks('@media (orientation: portrait) and (max-height: 600px)').find((b) => b.includes('#overlay.end'));
  assert.ok(tiny && !/font-size|font:/.test(tiny), 'the 320x568 rule only changes spacing');
});
ok('on an upright phone the end card packs what was earned two to a line, emblem beside the words', () => {
  const m = mediaBlocks('@media (orientation: portrait) and (max-width: 500px)').find((b) => b.includes('#overlay.end'));
  assert.ok(m, 'the upright phone rule for the end card');
  assert.match(m, /#overlay\.end \.card \.name::before \{ content: none; \}/);
  assert.match(m, /#overlay\.end \.ec-got \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 120px\), 1fr\)\);/);
  assert.match(m, /#overlay\.end \.ec-item \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\);/);
  assert.match(m, /#overlay\.end \.ec-item > canvas\.ec-icon \{ grid-column: 1; grid-row: 1 \/ span 2; width: 32px; height: 32px; \}/);
  assert.ok(!/font-size|font:/.test(m), 'no text gets smaller');
});
ok('on a phone on its side the end card panel takes the width and the emblems sit beside their words', () => {
  const m = mediaBlocks('@media (orientation: landscape) and (max-height: 500px)').find((b) => b.includes('#overlay.end .ec-item'));
  assert.ok(m, 'the short landscape rule for the end card');
  assert.match(m, /#overlay\.end \.ec \{ max-width: calc\(100vw - 32px\); row-gap: 2px; \}/);
  assert.match(m, /#overlay\.end \.ec-item > canvas\.ec-icon \{ grid-column: 1; grid-row: 1 \/ span 2; width: 24px; height: 24px; \}/);
});
ok("What's New on a short screen: packed tighter (never smaller text), the offer and CLOSE ride the note's bottom", () => {
  assert.match(css, /#overlay \.card\.paper-note\.wn-over \.wn-acts \{ position: sticky; bottom: 0; z-index: 3;/);
  const main = read('src/main.js');
  assert.match(main, /'<div class="wn-acts">' \+\s*\(offerGuided \? '<div class="offer">[^']*<\/div>' : ''\) \+\s*'<div class="wn-close">CLOSE<\/div><\/div>'/);
  const land = mediaBlocks('@media (orientation: landscape) and (max-height: 500px)').find((b) => b.includes('wn-over'));
  const port = mediaBlocks('@media (orientation: portrait) and (max-height: 700px)').find((b) => b.includes('wn-over'));
  assert.ok(land && port, 'both short-screen rules');
  assert.match(land, /#overlay \.card\.paper-note\.wn-over \{ width: min\(92vw, 760px\);/);
  assert.match(land + port, /\.wn-over \.desc \{ line-height: 1\.45; \}/);
  assert.ok(!/font-size|font:/.test(land) && !/font-size|font:/.test(port), 'no text gets smaller');
});

// ---- 5. every declared menu text size is the one it had before the pixel font -------------
// The table is every "font-size: Npx" in index.html's style at 8c2e243^1 (the tree before the
// pixel font), keyed by its @media and selector. Each must still be there at the same size.
const OLD_SIZES = [
  [" | #hud", 14],
  [" | #overlay h1", 28],
  [" | #overlay h1.logo", 46],
  [" | #overlay.settings h1", 20],
  [" | #overlay.settings .sub", 11],
  [" | #overlay.settings .card .name", 12],
  [" | #overlay.settings .card .desc", 10],
  [" | #overlay.settings.tight h1", 15],
  [" | #overlay.settings.tight .card .name", 11],
  [" | #overlay.settings.tight .card .desc", 9],
  [" | #draft-actions .dact", 12],
  [" | #draft-autopick", 11],
  [" | .forge-sign", 16],
  [" | .forge-row.tight .forge-sign", 12],
  [" | #overlay.draft.compact h1", 16],
  [" | #overlay.draft.compact h1.logo", 20],
  [" | #overlay.draft.compact .sub", 11],
  [" | #overlay.loadout-tight .card .name", 13],
  [" | #overlay.loadout-tight .card .desc", 11],
  [" | #overlay.draft.compact .card .name", 12],
  [" | #overlay.draft.compact .card .desc", 11],
  [" | #overlay.draft.compact .card .syn", 10],
  [" | #overlay.draft.compact .card .evo", 10],
  [" | #overlay.draft.compact .card .par", 10],
  [" | #overlay.draft.compact #draft-actions .dact", 11],
  [" | .card .desc", 12],
  [" | .card .syn", 11],
  [" | .card .key", 11],
  [" | .dcard .ribbon", 10],
  [" | .dcard .tag", 10],
  [" | .dcard .fx", 12],
  [" | .dcard .fx.evo", 11],
  [" | .dcard .fx.lead", 11],
  [" | .dcard .fx.stack", 11],
  [" | .dcard .fx.road", 11],
  [" | .dcard .fx.dim", 11],
  [" | .dcard .detail .dname", 12],
  [" | .dcard .detail .desc", 11],
  [" | #overlay.draft.compact .dcard .ribbon", 10],
  [" | #overlay.draft.compact .dcard .tag", 10],
  [" | #overlay.draft.compact .dcard .fx", 11],
  [" | #overlay.draft.compact .dcard .fx.evo", 10],
  [" | #overlay.draft.compact .dcard .fx.lead", 10],
  [" | #overlay.draft.compact .dcard .fx.stack", 10],
  [" | #overlay.draft.compact .dcard .fx.dim", 10],
  [" | .card.kit-card .desc", 13],
  [" | .card.paper-note .desc", 13],
  [" | .card.paper-note .offer", 13],
  [" | .card.paper-note .wn-close", 14],
  [" | #overlay.howto .card.ref .desc", 15],
  [" | #overlay.howto .subhead", 12],
  [" | #overlay.howto .card.nav .name", 12],
  [" | #overlay.howto .card.nav .desc", 10],
  ["@media (min-width: 860px) | #overlay.howto .howto-page", 12],
  [" | #overlay .sub", 13],
  [" | #overlay .away-time", 12],
  [" | #overlay .away-gold", 26],
  [" | #overlay .away-rows", 13],
  ["@media (pointer: coarse) and (orientation: landscape) | #overlay.title .card .desc", 11],
  ["@media (orientation: landscape) and (max-height: 500px) | #overlay.title .card.setup .name", 13],
  ["@media (orientation: landscape) and (max-height: 500px) | #overlay.title .card.setup .desc", 11],
  [" | #overlay .sub .pass", 11],
  [" | #overlay.end .ec-tags", 12],
  [" | #overlay.end .ec-earned", 20],
  [" | #overlay.end .ec-item", 12],
  [" | #overlay.end .ec-item .ec-cap", 12],
  [" | #overlay.end .ec-more", 12],
  [" | #overlay.end > .sub", 14],
  ["@media (orientation: landscape) and (max-height: 500px) | #overlay.end .card .desc", 11],
  ["@media (orientation: landscape) and (max-height: 500px) | #overlay.end .ec-earned", 16],
  ["@media (orientation: landscape) and (max-height: 500px) | #overlay.end .ec-more", 12],
  ["@media (orientation: portrait) and (max-width: 600px) | #overlay.end .ec-more", 12],
  [" | #tour-tip", 13],
  [" | #tour-tip .tour-count", 10],
  [" | #tour-tip .tour-replay", 10],
  [" | #tour-tip .tour-btn", 12],
  [" | #tut-panel", 15],
  [" | #tut-panel .tut-btn", 13],
  [" | #tut-panel .tut-skip", 11],
  ["@media (max-width: 700px), (max-height: 420px) | #tut-panel", 13],
  [" | #touch.cog-only .keybar", 11],
  [" | #touch .keybar button", 11],
  ["@media (min-width: 1600px) | #touch.cog-only .keybar", 13],
  ["@media (min-width: 1600px) | #touch .keybar button", 13],
  [" | body.pads-compact #touch .pad button", 11],
  [" | body.pads-compact #touch button .badge", 9],
  [" | body.pads-compact #touch button .key", 9],
  [" | #touch button", 13],
  [" | #touch button .badge", 11],
  [" | #touch button .key", 10],
  [" | #touch button.cog", 10],
  [" | #touch button.cog.help", 10],
  [" | #touch button.cog.radar", 10],
  [" | #touch button.cog.map", 10],
  [" | #help-hud", 12],
  [" | #help-tip", 13],
  ["@media (pointer: coarse), (max-width: 700px) | .card .desc", 13],
  [" | #overlay .shop-arr", 26],
  [" | #overlay .shop-ind", 12],
  [" | #overlay.shop-compact > h1", 18],
  [" | #overlay.shop-compact .sub", 12],
  [" | #overlay.shop-compact .cards.shopgrid > .card .name", 12],
  [" | #overlay.shop-compact .cards.shopgrid > .card .desc", 11],
  [" | #overlay.shop-compact.shop-low .card.shop-footer .name", 13],
];
const declaredSizes = () => {
  const out = new Map(); const stack = []; let buf = '';
  for (const ch of css) {
    if (ch === '{') { stack.push(buf.trim().replace(/\s+/g, ' ')); buf = ''; }
    else if (ch === '}') {
      const head = stack.pop();
      if (head && !head.startsWith('@')) {
        const m = /(?:^|;)\s*font-size\s*:\s*([\d.]+)px/.exec(buf);
        if (m) { const media = stack.filter((h) => h.startsWith('@')).join(' '); for (const sel of head.split(',').map((x) => x.trim())) out.set(media + ' | ' + sel, +m[1]); }
      }
      buf = '';
    } else buf += ch;
  }
  return out;
};
ok('every menu text size declared before the pixel font is unchanged (' + OLD_SIZES.length + ' rules)', () => {
  const now = declaredSizes();
  const bad = OLD_SIZES.filter(([k, v]) => now.get(k) !== v).map(([k, v]) => k + ' was ' + v + 'px, now ' + now.get(k));
  assert.deepEqual(bad, []);
  assert.ok(OLD_SIZES.length > 100);
});

console.log(`test_menu_font: ${n} checks passed`);
