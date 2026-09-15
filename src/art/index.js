// HORDES — src/art barrel (A1 ART TRACK, new file).
//
// One import point for every hand-authored art set:
//   import { TROPHY_ART, CHARACTER_PORTRAITS, SHOP_ICONS, TITLE_ART, PORTAL_ART } from './art/index.js';
//
// Each flat asset is { id, grid, palette, rows, w, h } and each animated asset
// is { id, frames, palette, rows, frameCount, w, h }. `grid`/`frames` are the
// game's native integer-pixel format (0 = transparent, 1..9 = palette keys) and
// paint directly with the renderer:
//   renderer.drawGrid(g, TROPHY_ART.FIRST_BLOOD.grid, TROPHY_ART.FIRST_BLOOD.palette, x, y)
//
// ART_SECTIONS / ART_ASSETS are the enumeration surface for consumers that must
// walk everything (the trophy gallery, the art-lint test, tools/art_preview.html)
// so nothing has to hard-code an art list a second time.
import { TROPHY_ART, TROPHY_IDS, TROPHY_FALLBACK_ID, trophyArt } from './trophies.js';
import { CHARACTER_PORTRAITS, CHARACTER_IDS, characterPortrait } from './portraits.js';
import { SHOP_ICONS, SHOP_ICON_IDS, SHOP_ICON_FALLBACK_ID, shopIcon } from './shop_icons.js';
import { TITLE_ART, TITLE_LAYERS, TITLE_WIDTH, TITLE_HEIGHT, composeTitle, drawTitle } from './title.js';
import { PORTAL_ART, PORTAL_PALETTE, PORTAL_BOX, portalFrame } from './portal.js';
import { APEX_ART, APEX_IDS, APEX_FALLBACK_ID, apexArt } from './apex.js';

export * from './format.js';
export {
  TROPHY_ART, TROPHY_IDS, TROPHY_FALLBACK_ID, trophyArt,
  CHARACTER_PORTRAITS, CHARACTER_IDS, characterPortrait,
  SHOP_ICONS, SHOP_ICON_IDS, SHOP_ICON_FALLBACK_ID, shopIcon,
  TITLE_ART, TITLE_LAYERS, TITLE_WIDTH, TITLE_HEIGHT, composeTitle, drawTitle,
  PORTAL_ART, PORTAL_PALETTE, PORTAL_BOX, portalFrame,
  APEX_ART, APEX_IDS, APEX_FALLBACK_ID, apexArt,
};

export const ART_SECTIONS = [
  {
    id: 'trophies', kind: 'flat', scale: 4,
    label: 'TROPHIES — 32x32, one per achievement, shown full-screen',
    items: TROPHY_IDS.map(id => TROPHY_ART[id]),
  },
  {
    id: 'portraits', kind: 'framed', scale: 4,
    label: 'CHARACTER PORTRAITS — 32x32 busts, 2 idle frames each',
    items: CHARACTER_IDS.map(id => CHARACTER_PORTRAITS[id]),
  },
  {
    id: 'shop', kind: 'flat', scale: 5,
    label: 'SHOP / UPGRADE ICONS — 16x16, one per SHOP_UPGRADES row',
    items: SHOP_ICON_IDS.map(id => SHOP_ICONS[id]).concat([SHOP_ICONS[SHOP_ICON_FALLBACK_ID]]),
  },
  {
    id: 'title', kind: 'layered', scale: 1,
    label: 'TITLE SCREEN CARD — 480x300, layered (menu overlays this)',
    items: TITLE_LAYERS,
  },
  {
    id: 'portal', kind: 'framed', scale: 4,
    label: 'DETAILED PORTAL — 48x48, 4 frames (boss-defeat cinematic)',
    items: [PORTAL_ART],
  },
  {
    // G25 slice 2: the apex tier's own 32x32 emblems. APEX_IDS walks the
    // AUTHORED art only; an apex item shipping without art yet (items 3..6)
    // resolves to the shared LOCKED silhouette at draw time via apexArt, so
    // this enumeration never gates the catalogue.
    id: 'apex', kind: 'flat', scale: 4,
    label: 'APEX EMBLEMS — 32x32, one per apex item, shown full-screen',
    items: APEX_IDS.map(id => APEX_ART[id]),
  },
];

// Flat enumeration of every asset object, tagged with its section. Derived from
// ART_SECTIONS, so a new asset added to a set appears here with no extra wiring.
export const ART_ASSETS = ART_SECTIONS.flatMap(sec =>
  sec.items.map(a => Object.assign({ section: sec.id }, a)));

export const ART_COUNTS = ART_SECTIONS.reduce((acc, sec) => {
  acc[sec.id] = sec.items.reduce((n, a) => n + (a.frames ? a.frames.length : 1), 0);
  return acc;
}, {});
