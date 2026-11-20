// HORDES master palette (R6). Every colour drawn in a fight comes from here.
//
// Muted dark fantasy: a few low-chroma ramps, dark to light, and three
// reserved families that carry a meaning (Steve's decision 5):
//   DANGER  red-orange   enemy shots, telegraphs, the threat marks on elites and bosses
//   REWARD  cyan-teal    gems, XP, the portal, chest and pickup glints, the evolve glow
//   HERO    warm white   the hero's mark and outline (and the pilots themselves)
// Rule: nothing outside a reserved family comes within RESERVED_DE (CIEDE2000)
// of any step of it. test/test_palette.mjs holds the rule; tools/palette_audit.mjs
// measures every colour the fight draws against it.
//
// The ramps are plain hex lists, darkest first. Art files keep their own hex
// literals (so the art stays readable where it is drawn); each literal must be
// one of these colours. tools/palette_snap.mjs finds the nearest one.

export const RAMPS = {
  // cool near-black to white: outlines, stone, steel, shadows, flashes
  INK:    ['#0b0912', '#1a1622', '#433e4e', '#5e5968', '#7c7886', '#9c98a4', '#bebac4', '#e4e2ea', '#ffffff'],
  // warm neutral: bone, sand, leather, wood
  BONE:   ['#1e1810', '#4e3f2a', '#6a583c', '#887352', '#a69070', '#cc9a78', '#c2ae8c', '#ece0c0'],
  // dark blood and crimson (never the bright red-orange of danger)
  BLOOD:  ['#3e1016', '#5c1820', '#7a222a', '#962e34', '#b83a4e', '#e06a74'],
  // moss and bile greens
  MOSS:   ['#1e3220', '#2e4a2c', '#46663a', '#62804a', '#86a062', '#acc084'],
  // void violet
  VOID:   ['#160e24', '#3a2654', '#6c4c94', '#8c6cb4', '#9a7cc8', '#b49ad4'],
  // night steel blue, up to a pale sky (frost, lightning)
  STEEL:  ['#1e2c44', '#304464', '#486084', '#647ea2', '#8aa0c0', '#b4c4dc', '#a8d0f4'],
  // ember amber and gold (the player's fire, holy gold, coin): not red-orange
  AMBER:  ['#523208', '#7a4c0e', '#a46a16', '#c88a22', '#e8902a', '#e2aa38', '#f0c860', '#f8e098'],
  // dusk rose and plum
  ROSE:   ['#3e142c', '#5c1e42', '#9c4074', '#c87ab8', '#d48aae'],
};

// Ramps one kind of thing owns: only that thing may use them.
export const OWNED = {
  // the potions: small, bright, picked up (health is a pink red, not danger)
  POTION: ['#ff4a5e', '#ffb0b8', '#4a8cff', '#a4c4fc'],
  // the gem tiers above the small teal one: mid blue, large violet (gems are
  // reward things, so their pale blue may sit near the reward family)
  GEM:    ['#2a6ad8', '#5ab0ff', '#d8f0ff', '#8a3ad8', '#d07aff', '#f4dcff'],
};

// The reserved families. Each is a ramp too; only things with its meaning may
// use these colours.
export const RESERVED = {
  DANGER: ['#b02608', '#ff4a14', '#ff6a24'],
  REWARD: ['#139e8a', '#4dffd2', '#5fffd8', '#b6fff0', '#e6fffa'],
  HERO:   ['#ffd8c4'],
};

// How near counts as "inside" a reserved family: CIEDE2000.
export const RESERVED_DE = 10;

export const SHARED = [...new Set(Object.values(RAMPS).flat())];
export const PALETTE = [...new Set([...SHARED, ...Object.values(OWNED).flat(), ...Object.values(RESERVED).flat()])];
const FAMILY_OF = new Map();
for (const [fam, list] of Object.entries(RESERVED)) for (const h of list) FAMILY_OF.set(h, fam);
const OWNER_OF = new Map();
for (const [own, list] of Object.entries(OWNED)) for (const h of list) OWNER_OF.set(h, own);
// The reserved family a palette colour belongs to, or null.
export const reservedFamily = (hex) => FAMILY_OF.get(String(hex).toLowerCase()) || null;
// The owned ramp a palette colour belongs to, or null.
export const ownedRamp = (hex) => OWNER_OF.get(String(hex).toLowerCase()) || null;
export const inPalette = (hex) => PALETTE.includes(String(hex).toLowerCase());

// ---- colour math -------------------------------------------------------------
export function hexRgb(hex) {
  let s = String(hex).trim().replace('#', '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function lab(hex) {
  const [r, g, b] = hexRgb(hex).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
// CIEDE2000 colour difference.
export function deltaE(h1, h2) {
  const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => { if (a === 0 && b === 0) return 0; const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * rad / 2);
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) { hm = Math.abs(hp1 - hp2) <= 180 ? hm / 2 : (hm < 360 ? (hm + 360) / 2 : (hm - 360) / 2); }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
// The nearest reserved family to a colour: { fam, step, de }.
export function nearestReserved(hex) {
  let best = { fam: null, step: null, de: Infinity };
  for (const [fam, list] of Object.entries(RESERVED)) {
    for (const s of list) { const d = deltaE(hex, s); if (d < best.de) best = { fam, step: s, de: d }; }
  }
  return best;
}
// The nearest palette colour to a colour, from the given list (default: the
// shared ramps).
export function nearest(hex, list = SHARED) {
  let best = null, bd = Infinity;
  for (const s of list) { const d = deltaE(hex, s); if (d < bd) { bd = d; best = s; } }
  return { hex: best, de: bd };
}
