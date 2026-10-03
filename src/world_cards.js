// HORDES — src/world_cards.js
//
// World cards (the vault's card, the cursed statue's deal) are drawn in the
// zoomed world layer but read as HUD: they must stay on screen and never sit
// on the HUD (the bars, the purse, the clock and its badges, the quest
// tracker). The world pass QUEUES each card with its box in world-layer view
// pixels and a paint callback; the HUD pass draws them after the chrome,
// clamped to the screen and nudged clear of it (below or to the left, the
// smaller move that stays on screen). Same look and size as before: the card
// is painted under the same zoom transform, only offset.

const queue = [];

// box = { x, y, w, h } in world-layer view px (before the zoom); paint(g, x, y)
// draws the card with its top-left at (x, y) in the same space.
export function queueWorldCard(box, paint) {
  queue.push({ x: box.x, y: box.y, w: box.w, h: box.h, paint });
}

// Drop whatever is queued (start of a world pass).
export function clearWorldCards() { queue.length = 0; }

export function pendingWorldCards() { return queue.slice(); }

const hit = (a, b, m) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

// Pure: where a SCREEN box goes so it clears every `avoid` box (screen px),
// inside a view of vw x vh. Tries no move, then below the box it hits, then
// left of it (never above: the clock sits there); the smallest move that clears all and stays on
// screen wins. A move that lands on another box steps on from there (the
// purse sits under the bars). Returns { x, y } (the new top-left).
export function placeClear(s, avoid, vw, vh, margin = 2) {
  const boxes = (avoid || []).filter(Boolean);
  const at = (c) => ({ x: c.x, y: c.y, w: s.w, h: s.h });
  const hits = (c) => boxes.filter(b => hit(at(c), b, margin));
  if (!hits(s).length) return { x: s.x, y: s.y };
  let best = null, bd = Infinity;
  let front = [{ x: s.x, y: s.y }];
  const seen = new Set();
  for (let round = 0; round < 4 && front.length; round++) {
    const next = [];
    for (const f of front) {
      for (const b of hits(f)) {
        for (const c of [{ x: f.x, y: b.y + b.h + margin }, { x: b.x - margin - s.w, y: f.y },
          { x: b.x - margin - s.w, y: b.y + b.h + margin }]) {
          const key = c.x + ',' + c.y;
          if (seen.has(key)) continue;
          seen.add(key);
          if (c.x < 0 || c.y < 0 || c.x + s.w > vw || c.y + s.h > vh) continue;
          if (hits(c).length) { next.push(c); continue; }
          const d = Math.abs(c.x - s.x) + Math.abs(c.y - s.y);
          if (d < bd) { bd = d; best = c; }
        }
      }
    }
    front = next;
  }
  return best || { x: s.x, y: s.y };
}

// Draw the queued cards over the HUD. `Z` and `shake` are the world layer's
// zoom and shake; `avoid` are screen boxes (the HUD's chrome). The card's box
// is clamped in SCREEN px, after the zoom: a clamp in world-layer px lands off
// screen once Z > 1. Returns the screen boxes drawn (the HUD's chrome record,
// for tests and captures).
export function flushWorldCards(g, { Z = 1, shake = { x: 0, y: 0 }, vw, vh, avoid = [] }) {
  const out = [];
  const cx = vw / 2, cy = vh / 2;
  const EDGE = 2;   // px kept between a card and the screen edge
  for (const c of queue) {
    const s = { x: (c.x - cx + shake.x) * Z + cx, y: (c.y - cy + shake.y) * Z + cy, w: c.w * Z, h: c.h * Z };
    const on = { x: Math.max(EDGE, Math.min(vw - s.w - EDGE, s.x)), y: Math.max(EDGE, Math.min(vh - s.h - EDGE, s.y)), w: s.w, h: s.h };
    const at = placeClear(on, avoid, vw, vh);
    const dx = (at.x - s.x) / Z, dy = (at.y - s.y) / Z;
    g.save();
    g.translate(cx, cy);
    g.scale(Z, Z);
    g.translate(-cx + shake.x, -cy + shake.y);
    c.paint(g, Math.round(c.x + dx), Math.round(c.y + dy));
    g.restore();
    out.push({ x: Math.round(at.x), y: Math.round(at.y), w: Math.round(s.w), h: Math.round(s.h), moved: at.x !== s.x || at.y !== s.y });
  }
  queue.length = 0;
  return out;
}
