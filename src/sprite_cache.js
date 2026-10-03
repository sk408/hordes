// HORDES — sprite cache. Every pixel grid (and every small procedural
// painter) is rasterised once per (art, palette, style) into an offscreen
// canvas and drawn with one drawImage, instead of one fillRect per pixel per
// frame. Styles bake the readability dressing into the raster: a 1px dark
// outline, a top rim light, a contact shadow, the silhouette-shaped hit
// flash, the chill tint and the coloured elite / rarity outlines.
//
// Where no real 2D canvas exists (the headless test harness hands out a
// Proxy stub) every entry point falls back to painting the art directly
// with fillRect, exactly as the renderer did before the cache existed.

// ---- canvas source ---------------------------------------------------------
// factory(w, h) -> a canvas, or null when unavailable. Probed lazily: a
// canvas counts only if a painted pixel can be read back.
let factory;          // undefined = not probed yet
let hostCanvas = null;

function makeFactory() {
  let make = null;
  if (typeof OffscreenCanvas === 'function') {
    make = (w, h) => new OffscreenCanvas(w, h);
  } else if (hostCanvas && hostCanvas.ownerDocument && hostCanvas.ownerDocument.createElement) {
    const doc = hostCanvas.ownerDocument;
    make = (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
  }
  if (!make) return null;
  try {
    const c = make(1, 1);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1);
    if (!d || !d.data || d.data[3] !== 255) return null;
  } catch { return null; }
  return make;
}

// The renderer lends its canvas so a browser without OffscreenCanvas can
// still borrow scratch canvases from the same document.
export function setCacheHost(canvas) {
  hostCanvas = canvas || null;
  if (factory === null) factory = undefined;   // re-probe with the new host
}

export function cacheEnabled() {
  if (factory === undefined) factory = makeFactory();
  return !!factory;
}

// ---- styles ----------------------------------------------------------------
// outline: colour of the 1px ring round the silhouette (null = none)
// outline2: colour of a second ring outside the first (elite / rarity tells)
// rim: lighten the top edge, darken the bottom edge
// shadow: bake a contact shadow under the feet
// flash: paint the whole silhouette white (hit flash)
// tint: [r, g, b, a] blended over the body (chill)
// mute: pull the colours a little toward grey and darker (art pass: the
//   horde sits a step behind the hero, who stays at full saturation)
const OUTLINE_DARK = '#0b0912';
const styles = new Map();
export function spriteStyle(spec) {
  const s = spec || {};
  const key = (s.outline || '') + '|' + (s.outline2 || '') + '|' + (s.rim ? 1 : 0) +
    (s.shadow ? 1 : 0) + (s.flash ? 1 : 0) + (s.mute ? 'm' : '') + '|' + (s.tint ? s.tint.join(',') : '');
  let st = styles.get(key);
  if (!st) {
    st = { key, outline: s.outline || null, outline2: s.outline2 || null, rim: !!s.rim,
      shadow: !!s.shadow, flash: !!s.flash, tint: s.tint || null, mute: !!s.mute };
    st.pad = st.outline2 ? 2 : (st.outline ? 1 : 0);
    st.below = st.shadow ? 2 : 0;
    styles.set(key, st);
  }
  return st;
}
export const STYLE_PLAIN = spriteStyle({});
export const STYLE_ITEM = spriteStyle({ outline: OUTLINE_DARK });
const CHILL = [106, 168, 216, 0.45];
// The style of a live actor: flags pick the baked variant.
//   ring: outer tell colour (elite gold, rarity colour, telegraph white)
//   mute: the horde look (see `mute` above); the hero and bosses pass false
export function actorStyle(flash, slow, ring, grounded = true, mute = false) {
  return spriteStyle({
    outline: flash ? '#ffffff' : OUTLINE_DARK, outline2: ring || null,
    rim: !flash, shadow: grounded, flash: !!flash, tint: (!flash && slow) ? CHILL : null,
    mute: !flash && mute,
  });
}

// ---- bake ------------------------------------------------------------------
const paletteIds = new WeakMap();
let nextPaletteId = 1;
function paletteId(p) {
  let id = paletteIds.get(p);
  if (!id) { id = nextPaletteId++; paletteIds.set(p, id); }
  return id;
}
const gridEntries = new WeakMap();   // grid -> Map(paletteId:style -> entry)
const painted = new Map();           // key -> entry
const stats = { baked: 0, blits: 0, fallbacks: 0 };

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Post-process a freshly painted raster: rim light, flash, tint, outlines.
// `g` holds the art at (pad, pad) on a transparent w x h canvas.
function dress(g, w, h, st) {
  if (!st.rim && !st.flash && !st.tint && !st.outline && !st.mute) return;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : solid[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid[y * w + x]) continue;
      const i = (y * w + x) * 4;
      if (st.flash) { d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 255; continue; }
      if (st.mute) {
        const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        d[i] = (d[i] * 0.78 + l * 0.22) * 0.9;
        d[i + 1] = (d[i + 1] * 0.78 + l * 0.22) * 0.9;
        d[i + 2] = (d[i + 2] * 0.78 + l * 0.22) * 0.9;
      }
      if (st.rim) {
        if (!at(x, y - 1)) {            // top edge catches the light
          d[i] += (255 - d[i]) * 0.32; d[i + 1] += (255 - d[i + 1]) * 0.32; d[i + 2] += (255 - d[i + 2]) * 0.32;
        } else if (!at(x, y + 1)) {     // underside falls into shade
          d[i] *= 0.74; d[i + 1] *= 0.74; d[i + 2] *= 0.78;
        }
      }
      if (st.tint) {
        const [r, gg, b, a] = st.tint;
        d[i] += (r - d[i]) * a; d[i + 1] += (gg - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a;
      }
    }
  }
  const ring = (col, src) => {
    const [r, gg, b] = hexRgb(col);
    const hit = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[y * w + x]) continue;
        if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) ||
            (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) hit.push(y * w + x);
      }
    }
    for (const p of hit) {
      d[p * 4] = r; d[p * 4 + 1] = gg; d[p * 4 + 2] = b; d[p * 4 + 3] = 255;
      src[p] = 1;
    }
  };
  if (st.outline) ring(st.outline, solid);
  if (st.outline2) ring(st.outline2, solid);
  g.putImageData(img, 0, 0);
}

// Rasterise `paint(ctx, ox, oy)` (art origin at ox, oy) for a box of
// artW x artH pixels whose top-left sits (bx, by) from the origin.
function bake(artW, artH, bx, by, st, paint) {
  const pad = st.pad;
  const w = artW + pad * 2, h = artH + pad * 2;
  const body = factory(w, h);
  const bg = body.getContext('2d');
  paint(bg, pad - bx, pad - by);
  dress(bg, w, h, st);
  let img = body, fh = h;
  if (st.shadow) {
    // Contact shadow: two stacked bars under the feet, the sprite on top.
    fh = h + st.below;
    img = factory(w, fh);
    const sg = img.getContext('2d');
    const sw = Math.max(4, Math.round(artW * 0.8));
    const sx = Math.round((w - sw) / 2);
    sg.fillStyle = 'rgba(0,0,0,0.38)';
    sg.fillRect(sx, h - 2, sw, 3);
    sg.fillRect(sx + 2, h + 1, Math.max(1, sw - 4), 1);
    sg.fillRect(sx + 2, h - 3, Math.max(1, sw - 4), 1);
    sg.drawImage(body, 0, 0);
  }
  stats.baked++;
  return { img, dx: bx - pad, dy: by - pad, w, h: fh };
}

function paintGridRects(g, grid, palette, x, y, s, white) {
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (v) { g.fillStyle = white ? '#ffffff' : palette[v]; g.fillRect(x + rx * s, y + ry * s, s, s); }
    }
  }
}

// Draw a pixel grid with its top-left art pixel at (x, y). `scale` is the
// integer block size (the cached raster is stretched; outlines scale too).
export function blitGrid(g, grid, palette, x, y, style = STYLE_PLAIN, scale = 1) {
  if (!cacheEnabled()) {
    stats.fallbacks++;
    paintGridRects(g, grid, palette, x, y, scale, style.flash);
    return false;
  }
  let per = gridEntries.get(grid);
  if (!per) { per = new Map(); gridEntries.set(grid, per); }
  const key = paletteId(palette) + ':' + style.key;
  let e = per.get(key);
  if (!e) {
    e = bake(grid[0].length, grid.length, 0, 0, style,
      (c, ox, oy) => paintGridRects(c, grid, palette, ox, oy, 1, false));
    per.set(key, e);
  }
  stats.blits++;
  if (scale === 1) g.drawImage(e.img, x + e.dx, y + e.dy);
  else g.drawImage(e.img, x + e.dx * scale, y + e.dy * scale, e.w * scale, e.h * scale);
  return true;
}

// Draw a procedural painter through the cache. `box` = { x, y, w, h } is the
// painter's extent relative to its origin; `paint(ctx, ox, oy)` must draw the
// same pixels for the same key. Falls back to calling paint on `g` directly.
export function blitPainted(g, key, box, paint, x, y, style = STYLE_PLAIN) {
  if (!cacheEnabled()) {
    stats.fallbacks++;
    paint(g, x, y);
    return false;
  }
  const k = key + '#' + style.key;
  let e = painted.get(k);
  if (!e) {
    e = bake(box.w, box.h, box.x, box.y, style, paint);
    painted.set(k, e);
  }
  stats.blits++;
  g.drawImage(e.img, x + e.dx, y + e.dy);
  return true;
}

// Soft round glow (auras, telegraph pools): `r` px radius, built from
// concentric pixel discs so it stays in the pixel-art idiom.
export function blitGlow(g, colour, r, x, y, alpha = 1) {
  const a = Math.max(1, Math.min(4, Math.round(alpha * 4)));   // 4 baked strengths
  const paint = (c, ox, oy) => {
    const [cr, cg, cb] = hexRgb(colour);
    for (let ring = 0; ring < 3; ring++) {
      const rr = Math.round(r * (1 - ring * 0.28));
      c.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.07 * a).toFixed(2) + ')';
      for (let yy = -rr; yy <= rr; yy++) {
        // Squashed 2:1 so the pool reads as lying on the ground.
        const half = Math.floor(Math.sqrt(rr * rr - yy * yy));
        if (yy % 2 === 0) c.fillRect(ox - half, oy + yy / 2, half * 2 + 1, 1);
      }
    }
  };
  if (!cacheEnabled()) return false;   // a glow is dressing: nothing to fall back to
  return blitPainted(g, 'glow:' + colour + ':' + r + ':' + a,
    { x: -r, y: -Math.ceil(r / 2), w: r * 2 + 1, h: Math.ceil(r / 2) * 2 + 1 }, paint, x, y);
}

export function cacheStats() { return { ...stats, styles: styles.size, painted: painted.size }; }

// ---- test seam -------------------------------------------------------------
export const SPRITE_CACHE_TEST = {
  // Count-only canvases: the cache takes its drawImage path with no raster
  // behind it (the headless draw-call probe).
  forceFakeCanvas() {
    const ctx = () => ({
      fillStyle: '', fillRect() {}, drawImage() {}, putImageData() {},
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    });
    factory = (w, h) => { const c = ctx(); return { width: w, height: h, getContext: () => c }; };
    painted.clear();
  },
  disable() { factory = null; painted.clear(); },
  reprobe() { factory = undefined; painted.clear(); },
  dress, bake: (w, h, st, paint) => bake(w, h, 0, 0, st, paint),
};
