// THE MENU FONT (R5 "one pixel font for all menus, a clear main PLAY button,
// readable hint contrast"): src/menu_font.js, index.html, the title's PLAY.
//   1. every character the menus use is in the font file (its cmap is read
//      from the woff2 itself), or is a listed symbol-fallback character;
//   2. the size table puts every declared size on the font's 11 px grid,
//      and inline sizes in the code are on the grid already;
//   3. the CSSOM switch moves sizes and restores them, leaves monospace and
//      in-run rules alone;
//   4. the loader: asked for during boot and never waited for, a failure
//      keeps today's font, a font that arrives while a menu is in view waits
//      for a screen change;
//   5. one main button on the title (PLAY) with its own frame tone;
//   6. hint and dim text reaches 4.5:1 against its background;
//   7. LOADING does not depend on the font; sw.js precaches it; credits.
// Run: node test/test_menu_font.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as MF from '../src/menu_font.js';
import { MENU_FRAME_PALETTES } from '../src/art/menu_frame.js';
import { boot } from './_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const html = read('index.html');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

// ---- the font's cmap, from the woff2 ------------------------------------------
function readBase128(b, o) {
  let v = 0;
  for (let i = 0; i < 5; i++) { const x = b[o.p++]; v = (v << 7) | (x & 0x7f); if (!(x & 0x80)) return v >>> 0; }
  throw new Error('bad UIntBase128');
}
function woff2Cmap(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'wOF2');
  const numTables = buf.readUInt16BE(12);
  const compLen = buf.readUInt32BE(20);
  const o = { p: 48 };
  const tags = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[o.p++];
    let tag = tags[flags & 0x3f] || ('#' + (flags & 0x3f));
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', o.p, o.p + 4); o.p += 4; }
    const ver = flags >> 6;
    const orig = readBase128(buf, o);
    const transformed = (tag === 'glyf' || tag === 'loca') ? ver !== 3 : ver !== 0;
    const len = transformed ? readBase128(buf, o) : orig;
    dir.push({ tag, len });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(o.p, o.p + compLen));
  let off = 0; let cmap = null;
  for (const t of dir) { if (t.tag === 'cmap') cmap = data.subarray(off, off + t.len); off += t.len; }
  assert.ok(cmap, 'the woff2 has a cmap');
  const nSub = cmap.readUInt16BE(2);
  const cps = new Set();
  for (let i = 0; i < nSub; i++) {
    const pid = cmap.readUInt16BE(4 + i * 8), eid = cmap.readUInt16BE(6 + i * 8), so = cmap.readUInt32BE(8 + i * 8);
    const fmt = cmap.readUInt16BE(so);
    if (fmt === 12 && pid === 3 && eid === 10) {
      const ng = cmap.readUInt32BE(so + 12);
      for (let g = 0; g < ng; g++) { const s = cmap.readUInt32BE(so + 16 + g * 12), e = cmap.readUInt32BE(so + 20 + g * 12); for (let c = s; c <= e; c++) cps.add(c); }
    } else if (fmt === 4 && pid === 3 && (eid === 1 || eid === 0)) {
      const seg = cmap.readUInt16BE(so + 6) / 2;
      const ends = so + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ros = deltas + seg * 2;
      for (let s = 0; s < seg; s++) {
        const end = cmap.readUInt16BE(ends + s * 2), start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2), ro = cmap.readUInt16BE(ros + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let gid;
          if (ro === 0) gid = (c + delta) & 0xffff;
          else { const g = cmap.readUInt16BE(ros + s * 2 + ro + (c - start) * 2); gid = g ? (g + delta) & 0xffff : 0; }
          if (gid) cps.add(c);
        }
      }
    }
  }
  return cps;
}
const fontBuf = fs.readFileSync(path.join(ROOT, MF.MENU_FONT.url));
const CMAP = woff2Cmap(fontBuf);

ok('the font file is the 12 KB Latin Pixelify Sans and its cmap reads (217 code points, A-z, digits, the dot and the dash)', () => {
  assert.equal(CMAP.size, 217);
  for (const ch of 'AZaz09 .·×—…›•') assert.ok(CMAP.has(ch.codePointAt(0)), 'has ' + ch);
  assert.ok(!CMAP.has(0x2660), 'no spade (the suits are a symbol fallback on purpose)');
});

// ---- 1. every character the menus use ------------------------------------------
const ENTITIES = { nbsp: 0xa0, middot: 0xb7, times: 0xd7, mdash: 0x2014, ndash: 0x2013, hellip: 0x2026, bull: 0x2022,
  rarr: 0x2192, larr: 0x2190, uarr: 0x2191, darr: 0x2193, harr: 0x2194, check: 0x2713, copy: 0xa9, deg: 0xb0,
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27 };
function codeChars(text) {
  const out = [];
  text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (let ln of text.split('\n')) {
    ln = ln.replace(/(^|[^:\\'"])\/\/.*$/, '$1');
    for (const m of ln.matchAll(/content:\s*'([^']*)'/g)) for (const e of m[1].matchAll(/\\([0-9a-fA-F]{4,5})/g)) out.push([parseInt(e[1], 16), ln]);
    for (const m of ln.matchAll(/\\u\{?([0-9a-fA-F]{4,5})\}?/g)) out.push([parseInt(m[1], 16), ln]);
    for (const m of ln.matchAll(/&([a-zA-Z]{2,8});/g)) {
      assert.ok(m[1] in ENTITIES, 'unknown entity &' + m[1] + '; - add it to the table: ' + ln.trim());
      out.push([ENTITIES[m[1]], ln]);
    }
    for (const m of ln.matchAll(/&#x([0-9a-fA-F]+);|&#(\d+);/g)) out.push([m[1] ? parseInt(m[1], 16) : +m[2], ln]);
    for (const ch of ln) { const c = ch.codePointAt(0); if (c > 126) out.push([c, ln]); }
  }
  return out;
}
const srcFiles = [];
const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
  const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) srcFiles.push(p); } };
walk('src');
ok('every character in src/ and index.html is in the font, or is a listed symbol-fallback character', () => {
  const missing = new Map();
  for (const f of [...srcFiles.filter((f) => f !== 'src/menu_font.js'), 'index.html']) {
    for (const [c, ln] of codeChars(read(f))) {
      if (CMAP.has(c) || String.fromCodePoint(c) in MF.SYMBOL_FALLBACK) continue;
      if (!missing.has(c)) missing.set(c, f + ': ' + ln.trim().slice(0, 90));
    }
  }
  assert.deepEqual([...missing].map(([c, w]) => 'U+' + c.toString(16).toUpperCase() + ' ' + w), []);
});
ok('the replaced characters are gone from the code and their replacements are in the font', () => {
  for (const [from, to] of Object.entries(MF.REPLACED)) {
    assert.ok(CMAP.has(to.codePointAt(0)), 'replacement in the font: ' + to);
    for (const f of [...srcFiles.filter((f) => f !== 'src/menu_font.js'), 'index.html']) {
      assert.ok(!codeChars(read(f)).some(([c]) => c === from.codePointAt(0)), f + ' still uses U+' + from.codePointAt(0).toString(16));
    }
  }
  for (const ch of Object.keys(MF.SYMBOL_FALLBACK)) assert.ok(!CMAP.has(ch.codePointAt(0)), 'listed fallback is really missing: ' + ch);
});

// ---- 2. the size table ---------------------------------------------------------------
function fakeRule(sel, decl) {
  const props = new Map(Object.entries(decl).map(([k, v]) => [k, [v, '']]));
  return { selectorText: sel, style: {
    getPropertyValue: (k) => (props.get(k) || [''])[0],
    getPropertyPriority: (k) => (props.get(k) || ['', ''])[1],
    setProperty: (k, v, p = '') => props.set(k, [v, p]) } };
}
ok('every px font size the stylesheet declares maps onto the 11 px grid (11, 22, 44)', () => {
  const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => +m[1]);
  assert.ok(sizes.length > 60);
  for (const s of sizes) assert.ok(MF.GRID_PX.includes(MF.gridSize(s)), s + 'px -> ' + MF.gridSize(s));
  assert.deepEqual([9, 11, 13, 16, 18, 22, 28, 46].map(MF.gridSize), [11, 11, 11, 11, 22, 22, 22, 44]);
  assert.match(css, /html\.px-font body \{ font-size: 11px; \}/, 'inherited text (16 px by default) is 11 px with the font');
});
ok('inline font sizes written by the code are on the grid already (the switch does not see them)', () => {
  for (const f of srcFiles) {
    for (const m of read(f).matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(MF.GRID_PX.includes(+m[1]), f + ': ' + m[0]);
  }
});
ok('the main button and the shop buy line ask for grid sizes', () => {
  assert.match(css, /#overlay\.title \.card\.main \.name \{ font-size: 22px;/);
  const main = read('src/main.js');
  assert.match(main, /const fs = shopBuyPx\(gridPlan\.cardW, maxCh, menuFontOn\(\)\);/);
  // With the font on the buy line is 11 px at every card width (it was 9 or
  // 10 px where 11 did not fit, off the grid); today's font still shrinks.
  for (let w = 40; w <= 320; w += 7) for (let ch = 5; ch <= 16; ch++) {
    assert.equal(MF.shopBuyPx(w, ch, true), 11, w + 'px card, ' + ch + ' characters');
  }
  assert.equal(MF.shopBuyPx(93, 13, false), 9);
  assert.equal(MF.shopBuyPx(300, 10, false), 12);
});
ok('a size given as a variable\'s fallback is on the grid with the font (the camp\'s buy line)', () => {
  const fb = [...css.matchAll(/font-size:\s*var\(--[\w-]+,\s*([\d.]+)px\)/g)].map((m) => +m[1]);
  assert.ok(fb.length >= 1, 'the shop buy line\'s var() fallback is in the stylesheet');
  const r = fakeRule('.card .desc .buy', { 'font-size': 'var(--shop-buy-fs, 12px)' });
  const doc = { styleSheets: [{ cssRules: [r] }] };
  const saved = MF.snapSheetSizes(doc);
  assert.equal(r.style.getPropertyValue('font-size'), 'var(--shop-buy-fs, 11px)');
  MF.restoreSheetSizes(saved);
  assert.equal(r.style.getPropertyValue('font-size'), 'var(--shop-buy-fs, 12px)');
});

// ---- 3. the CSSOM switch -------------------------------------------------------------------
ok('the switch moves sizes onto the grid, keeps monospace and in-run rules, and can be undone', () => {
  const a = fakeRule('.card .desc', { 'font-size': '12px' });
  const b = fakeRule('#boot-msg', { 'font-size': '14px', 'font-family': 'monospace' });
  const c = fakeRule('#touch .keybar', { 'font-size': '13px' });
  const d = fakeRule('#overlay h1', { 'font-size': '28px' });
  const e = fakeRule('.x', { 'font-size': '11px' });
  const media = { cssRules: [d] };
  const doc = { styleSheets: [{ cssRules: [a, b, c, media, e] }], documentElement: { classList: new Set() } };
  const saved = MF.snapSheetSizes(doc);
  assert.equal(a.style.getPropertyValue('font-size'), '11px');
  assert.equal(d.style.getPropertyValue('font-size'), '22px', 'inside @media too');
  assert.equal(b.style.getPropertyValue('font-size'), '14px', 'LOADING keeps its size and font');
  assert.equal(c.style.getPropertyValue('font-size'), '13px', 'the touch pads keep theirs');
  assert.equal(saved.length, 2);
  MF.restoreSheetSizes(saved);
  assert.equal(a.style.getPropertyValue('font-size'), '12px');
  assert.equal(d.style.getPropertyValue('font-size'), '28px');
});

// ---- 4. the loader ----------------------------------------------------------------------------
function fakeEnv({ fail = false, visible = false } = {}) {
  const added = [];
  let resolveLoad;
  class FF { constructor(fam, src, desc) { this.fam = fam; this.src = src; this.desc = desc; }
    load() { return new Promise((res, rej) => { resolveLoad = () => (fail ? rej(new Error('404')) : res(this)); }); } }
  const cls = new Set();
  const doc = { styleSheets: [{ cssRules: [fakeRule('.a', { 'font-size': '13px' })] }],
    documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } } };
  const overlay = { style: { display: visible ? 'flex' : 'none', opacity: '' } };
  return { env: { doc, FontFace: FF, fonts: { add: (f) => added.push(f) }, overlay }, added, cls, overlay, go: () => resolveLoad() };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
MF.__resetMenuFont();
{
  const f = fakeEnv();
  const p = MF.loadMenuFont(f.env);
  await tick();
  ok('while loading, the menus keep today\'s font', () => { assert.equal(MF.menuFontState().status, 'loading'); assert.ok(!f.cls.has('px-font')); });
  f.go(); await p;
  ok('loaded with no menu in view: the switch is at once, the face is weight 400, the file is the woff2', () => {
    assert.equal(MF.menuFontState().status, 'on'); assert.ok(f.cls.has('px-font'));
    assert.equal(f.added.length, 1); assert.equal(f.added[0].desc.weight, '400');
    assert.match(f.added[0].src, /assets\/fonts\/PixelifySans-latin\.woff2/);
    assert.equal(MF.loadMenuFont(f.env), null, 'loads once');
  });
  MF.removeMenuFont(f.env.doc);
  ok('the switch can be undone (class off, sizes back)', () => assert.ok(!f.cls.has('px-font')));
}
MF.__resetMenuFont();
{
  const f = fakeEnv({ visible: true });
  const p = MF.loadMenuFont(f.env); await tick(); f.go(); await p;
  ok('loaded while a menu is in view: it waits (no jump under the player\'s eyes)', () => {
    assert.equal(MF.menuFontState().status, 'ready'); assert.ok(!f.cls.has('px-font'));
    assert.equal(MF.maybeApplyMenuFont(f.env.doc, f.overlay, false), false);
  });
  f.overlay.style.opacity = '0';
  ok('a menu faded to nothing (the title\'s art beat) is not in view: it switches', () => {
    assert.equal(MF.maybeApplyMenuFont(f.env.doc, f.overlay, false), true); assert.ok(f.cls.has('px-font'));
  });
  MF.removeMenuFont(f.env.doc); f.overlay.style.opacity = '';
  ok('a screen change switches it even with the overlay up', () => {
    assert.equal(MF.maybeApplyMenuFont(f.env.doc, f.overlay, true), true); assert.ok(f.cls.has('px-font'));
  });
}
MF.__resetMenuFont();
{
  const f = fakeEnv({ fail: true });
  const p = MF.loadMenuFont(f.env); await tick(); f.go(); const r = await p;
  ok('a failed load keeps today\'s font for the session, silently', () => {
    assert.equal(r, false); assert.equal(MF.menuFontState().status, 'failed'); assert.ok(!f.cls.has('px-font'));
    assert.equal(MF.maybeApplyMenuFont(f.env.doc, f.overlay, true), false);
  });
}
MF.__resetMenuFont();
ok('no FontFace (an old browser): today\'s font, no throw', () => {
  assert.equal(MF.loadMenuFont({ doc: {}, FontFace: null, fonts: null }), null);
  assert.equal(MF.menuFontState().status, 'failed');
});
MF.__resetMenuFont();

// The real game asks for it during boot, once, just before the frame loop
// starts (so no precached file is fetched after the first frame: G2), and
// the boot does not wait for it.
ok('main.js asks for the font right before the frame loop starts, and nowhere else', () => {
  const main = read('src/main.js');
  assert.equal(main.match(/loadMenuFont\(/g).length, 1);
  assert.match(main, /try \{ loadMenuFont\(\{ overlay \}\); \} catch \{ [^}]*\}\r?\nrequestAnimationFrame\(frame\);/);
});
const h = await boot({ storage: [['hordes_onboarded', '1']] });
ok('the real game boots and asked for it (no FontFace in node: today\'s font stays)', () => {
  assert.equal(MF.menuFontState().status, 'failed');
  assert.equal(MF.menuFontState().error, 'no FontFace');
});
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

// ---- 7. loading, the service worker, credits -----------------------------------------------------
ok('the menu font names monospace as its fallback and has ligatures off (no "fi" in "first")', () => {
  const m = /html\.px-font body, html\.px-font button, html\.px-font input, html\.px-font select,\s*html\.px-font textarea \{([^}]*)\}/.exec(css);
  assert.ok(m, 'the html.px-font family rule');
  const r = m[1];
  assert.match(r, /font-family: 'Pixelify Sans', monospace;/);
  assert.match(r, /font-variant-ligatures: none;/);
  assert.match(r, /font-feature-settings: 'liga' 0, 'clig' 0;/);
});
ok('a card name keeps the caret\'s room free on both sides, where the caret shows', () => {
  const left = +/left: (\d+)px/.exec(rule('.card .name::before'))[1];
  const pad = rule('html.px-font .card .name');
  const l = /padding-left: calc\((\d+)px \+ ([\d.]+)em\)/.exec(pad), rr = /padding-right: calc\((\d+)px \+ ([\d.]+)em\)/.exec(pad);
  assert.ok(l && rr, 'padding on both sides');
  assert.deepEqual([l[1], l[2]], [rr[1], rr[2]], 'the same both sides: the name stays centred');
  assert.ok(+l[1] >= left && +l[2] >= 0.6, 'the caret (at ' + left + 'px, about 0.5 em wide) and a gap fit');
  assert.match(css, /html\.px-font \.card\.dcard \.name::before,\s*html\.px-font #overlay\.shop-compact \.cards\.shopgrid > \.card \.name::before \{ content: none; \}/);
});
ok('LOADING and the tap-to-reload screen are set in monospace and never wait for the font', () => {
  assert.match(rule('#boot-msg'), /font: 14px\/1\.5 monospace/);
  assert.match(css, /html\.px-font #touch, html\.px-font #touch button, html\.px-font #hud \{ font-family: monospace; \}/);
  assert.match(css, /html\.px-font \{ font-synthesis: none; \}/);
  assert.ok(!/@font-face/.test(html), 'no @font-face: the font is asked for by the code after the first frame');
  assert.ok(!/<link[^>]+font/i.test(html), 'no font preload');
});
ok('sw.js precaches the font; credits and the licence ship beside it', () => {
  const sw = read('sw.js');
  assert.match(sw, /'assets\/fonts\/PixelifySans-latin\.woff2': '[0-9a-f]{64}'/);
  assert.match(read('assets/fonts/CREDITS.md'), /PixelifySans-latin\.woff2 \| Pixelify Sans .*SIL Open Font License 1\.1/);
  assert.match(read('assets/fonts/OFL.txt'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

console.log(`test_menu_font: ${n} checks passed`);
