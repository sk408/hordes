// HORDES — src/world_art.js
//
// M5b slice 3 art: the vault, the key and its carrier's tell, the walled yard
// and its gate, the lever, cracked walls and their niches, the glyph, the
// quest tracker and the map marks. Plain integer fillRects (pixel art), drawn
// in world space by render.js after the sites.

import { queueWorldCard } from './world_cards.js';
import { VAULT, yardRects } from './vault.js';
import { SECRETS } from './secrets.js';
import { questLine } from './quests.js';

const STONE = { lit: '#8a8478', mid: '#5e584e', dark: '#2e2a26', line: '#141210' };

function plate(g, x, y, w, h, edge) {
  g.fillStyle = 'rgba(8,10,14,0.9)'; g.fillRect(x, y, w, h);
  g.fillStyle = edge; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1);
}
function tw(g, s) {
  const m = typeof g.measureText === 'function' ? g.measureText(s) : null;
  return (m && m.width > 0) ? m.width : s.length * 4.2;
}

// A small key icon (9x5) at (x, y) = its centre.
export function drawKey(g, x, y, col = '#ffd75e') {
  g.fillStyle = '#000000'; g.fillRect(x - 5, y - 3, 11, 7);
  g.fillStyle = col;
  g.fillRect(x - 4, y - 2, 3, 3); g.fillRect(x - 1, y - 1, 5, 1); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 4, y, 1, 1);
  g.fillStyle = '#000000'; g.fillRect(x - 3, y - 1, 1, 1);
}

function drawVault(g, s, x, y, t, hasKey, near) {
  const open = s.state === 'spent';
  // A squat stone strongroom with an iron door (20x18), ground at y.
  g.fillStyle = STONE.line; g.fillRect(x - 11, y - 19, 22, 20);
  g.fillStyle = STONE.mid; g.fillRect(x - 10, y - 18, 20, 18);
  g.fillStyle = STONE.lit; g.fillRect(x - 10, y - 18, 20, 3);
  g.fillStyle = STONE.dark;
  for (let r = 0; r < 3; r++) g.fillRect(x - 10, y - 13 + r * 5, 20, 1);
  if (open) {
    g.fillStyle = '#05060a'; g.fillRect(x - 5, y - 12, 10, 12);
    g.fillStyle = '#3a3a40'; g.fillRect(x - 9, y - 12, 4, 12);
  } else {
    g.fillStyle = '#4a4e58'; g.fillRect(x - 5, y - 12, 10, 12);
    g.fillStyle = '#7a808c'; g.fillRect(x - 5, y - 12, 10, 1);
    g.fillStyle = hasKey ? '#ffd75e' : '#c8a040'; g.fillRect(x - 1, y - 8, 2, 2); g.fillRect(x, y - 6, 1, 3);
    if (hasKey && Math.floor(t * 4) % 2 === 0) { g.fillStyle = '#fff0a0'; g.fillRect(x - 6, y - 21, 12, 1); }
  }
  if (!open && near) {
    const l1 = 'VAULT: ' + (s.reward === 'joker' ? 'A JOKER' : 'A RARE CHEST');
    const l2 = hasKey ? 'TOUCH IT WITH THE KEY' : 'LOCKED: KILL THE KEY CARRIER';
    g.font = 'bold 7px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    const w = Math.ceil(Math.max(tw(g, l1), tw(g, l2))) + 8, h = 20;
    // Under the vault, so it never sits on the HUD's top row.
    const bx = Math.round(Math.max(4, Math.min(480 - w - 4, x - w / 2))), by = Math.round(Math.min(300 - h - 4, y + 6));
    // Queued: the HUD pass draws it clear of the quest tracker (world_cards.js).
    queueWorldCard({ x: bx, y: by, w, h }, (c, cx, cy) => {
      c.font = 'bold 7px monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
      plate(c, cx, cy, w, h, '#ffd75e');
      c.fillStyle = '#ffd75e'; c.fillText(l1, cx + 4, cy + 2);
      c.fillStyle = hasKey ? '#8fe0a0' : '#9aa4b0'; c.fillText(l2, cx + 4, cy + 11);
    });
  }
}

function drawLever(g, s, x, y) {
  const pulled = s.state === 'spent';
  g.fillStyle = STONE.line; g.fillRect(x - 6, y - 5, 13, 6);
  g.fillStyle = STONE.mid; g.fillRect(x - 5, y - 4, 11, 4);
  g.fillStyle = '#2a2a30'; g.fillRect(x - 1, y - 6, 3, 2);
  // The handle: up and to the left when set, down to the right when pulled.
  g.fillStyle = '#7a5a3a';
  if (!pulled) { for (let i = 0; i < 9; i++) g.fillRect(x - Math.floor(i / 2), y - 7 - i, 2, 1); g.fillStyle = '#ff6a3a'; g.fillRect(x - 6, y - 18, 3, 3); }
  else { for (let i = 0; i < 9; i++) g.fillRect(x + 1 + Math.floor(i / 2) + 2, y - 7 - Math.floor(i / 3), 2, 1); g.fillStyle = '#8fe0a0'; g.fillRect(x + 7, y - 12, 3, 3); }
}

function drawYard(g, s, cam, t, gateFx, chest = true) {
  const rects = yardRects(s, false);
  for (const r of rects) {
    const x = Math.round(r.x - cam.x), y = Math.round(r.y - cam.y);
    if (r.gate) {
      // The gate: iron bars; once open, raised (a short stub) for good.
      const raise = s.open ? Math.min(1, (2.5 - gateFx) / 1.2) : 0;
      const horiz = r.w > r.h;
      g.fillStyle = '#1a1c22'; g.fillRect(x, y, r.w, r.h);
      if (!s.open || raise < 1) {
        g.fillStyle = '#7a808c';
        if (horiz) {
          const hh = Math.max(1, Math.round((r.h + 10) * (1 - raise)));
          for (let i = 2; i < r.w; i += 4) g.fillRect(x + i, y + r.h - hh, 1, hh);
          g.fillRect(x, y + r.h - hh, r.w, 1);
        } else {
          const hh = Math.round(r.h * (1 - raise));
          for (let i = 2; i < hh; i += 4) g.fillRect(x, y + i, r.w, 1);
        }
      }
      if (s.open) { g.fillStyle = '#3a3e48'; g.fillRect(x, y - (horiz ? 10 : 0), horiz ? r.w : r.w, 2); }
      continue;
    }
    g.fillStyle = STONE.line; g.fillRect(x - 1, y - 9, r.w + 2, r.h + 10);
    g.fillStyle = STONE.lit; g.fillRect(x, y - 8, r.w, 3);
    g.fillStyle = STONE.mid; g.fillRect(x, y - 5, r.w, r.h + 5);
    g.fillStyle = STONE.dark;
    for (let i = (Math.round(r.x) & 7); i < r.w; i += 8) g.fillRect(x + i, y - 5, 1, r.h + 5);
  }
  // The chest inside (gone once looted, or once the maw has closed the yard).
  if (chest && s.state !== 'spent') {
    const x = Math.round(s.x - cam.x), y = Math.round(s.y - cam.y);
    g.fillStyle = '#000000'; g.fillRect(x - 7, y - 9, 14, 10);
    g.fillStyle = '#8a5a2a'; g.fillRect(x - 6, y - 8, 12, 8);
    g.fillStyle = '#c8a040'; g.fillRect(x - 6, y - 5, 12, 1); g.fillRect(x - 1, y - 6, 2, 3);
    if (s.open && Math.floor(t * 3) % 2 === 0) { g.fillStyle = '#fff0a0'; g.fillRect(x + 4, y - 9, 1, 1); }
  }
}

function drawCrack(g, s, x, wy, handsOn) {
  if (s.state === 'spent') {
    // The opened niche: a dark recess in the wall face with rubble.
    g.fillStyle = '#05060a'; g.fillRect(x - 7, wy - 11, 14, 11);
    g.fillStyle = '#2e2a26'; g.fillRect(x - 8, wy - 12, 16, 1);
    g.fillStyle = '#6a6458'; g.fillRect(x - 9, wy, 3, 2); g.fillRect(x + 6, wy + 1, 2, 1); g.fillRect(x - 2, wy + 1, 2, 1);
    return;
  }
  const k = Math.min(1, s.hits / SECRETS.CRACK_HITS);
  // A pale chipped patch behind the crack so it reads on any wall.
  g.fillStyle = 'rgba(220,210,190,0.35)'; g.fillRect(x - 4, wy - 13, 9, 13);
  g.fillStyle = '#141210';
  // A zigzag crack that grows with the hits.
  const pts = [[0, -2], [-1, -4], [1, -6], [-1, -8], [0, -10], [2, -11], [-2, -12], [3, -5], [-3, -9]];
  const n = 4 + Math.round(k * (pts.length - 4));
  for (let i = 0; i < n; i++) g.fillRect(x + pts[i][0], wy + pts[i][1], 2, 2);
  if (k > 0.5) { g.fillStyle = '#05060a'; g.fillRect(x - 1, wy - 7, 2, 2); }
  if (handsOn) { g.fillStyle = 'rgba(255,215,94,0.5)'; g.fillRect(x - 3, wy - 13, 1, 1); }
}

function drawGlyph(g, s, x, y, t, shimmer) {
  // A worn rune tile on the ground: dim violet, brighter with the shimmer.
  const a = shimmer ? 0.55 + 0.35 * Math.sin(t * 6) : 0.35;
  g.fillStyle = 'rgba(20,12,30,' + (0.5).toFixed(2) + ')'; g.fillRect(x - 5, y - 3, 11, 6);
  g.fillStyle = 'rgba(200,122,255,' + a.toFixed(2) + ')';
  g.fillRect(x - 3, y - 2, 1, 4); g.fillRect(x - 3, y - 2, 4, 1); g.fillRect(x, y - 2, 1, 2);
  g.fillRect(x - 1, y, 3, 1); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 3, y - 2, 1, 1);
  if (shimmer && Math.floor(t * 5) % 3 === 0) { g.fillStyle = '#f0e0ff'; g.fillRect(x + 1, y - 5, 1, 1); }
}

// World pass, under the actors: the yard, the vault, the lever, the key on
// the ground, cracks and the glyph. `steering` = hands-on now (the shimmer).
// After the maw (poi.closed) only what still stands is drawn: the yard's walls
// and the opened niches. The vault, the lever, the key and the yard's chest no
// longer work, so they are neither drawn nor prompted.
export function drawWorldPoi(g, state, cam, cull, steering = false) {
  const w = state.poi;
  const t = state.time || 0;
  const p = state.player;
  if (w && w.yard) {
    const x = Math.round(w.yard.x - cam.x), y = Math.round(w.yard.y - cam.y);
    if (!cull(x, y, 90)) drawYard(g, w.yard, cam, t, w.gateFx || 0, !w.closed);
  }
  if (w && !w.closed) {
    if (w.vault) {
      const x = Math.round(w.vault.x - cam.x), y = Math.round(w.vault.y - cam.y);
      const near = p && Math.hypot(p.x - w.vault.x, p.y - w.vault.y) <= VAULT.PROMPT_R;
      if (!cull(x, y, 40)) drawVault(g, w.vault, x, y, t, !!w.hasKey, near);
    }
    if (w.lever) {
      const x = Math.round(w.lever.x - cam.x), y = Math.round(w.lever.y - cam.y);
      if (!cull(x, y, 30)) drawLever(g, w.lever, x, y);
    }
    if (w.keyDrop) {
      const x = Math.round(w.keyDrop.x - cam.x), y = Math.round(w.keyDrop.y - cam.y) - (Math.floor(t * 4) % 2);
      if (!cull(x, y, 20)) drawKey(g, x, y - 4);
    }
  }
  for (const s of state.secrets || []) {
    if (s.kind === 'crack') {
      const x = Math.round(s.x - cam.x), wy = Math.round(s.wallY - cam.y);
      if (!cull(x, wy, 30)) drawCrack(g, s, x, wy, steering && s.state !== 'spent');
    } else if (s.kind === 'glyph' && s.state !== 'spent') {
      const x = Math.round(s.x - cam.x), y = Math.round(s.y - cam.y);
      if (cull(x, y, 20)) continue;
      const near = p && Math.hypot(p.x - s.x, p.y - s.y) <= SECRETS.GLYPH_SEEN_STEER_R;
      drawGlyph(g, s, x, y, t, steering && near);
    }
  }
}

// Over the actors: the key over the carrier's head and a gold ring.
export function drawCarrierTell(g, state, cam, cull) {
  const e = state.poi && state.poi.carrier;
  if (!e || !(e.hp > 0)) return;
  const x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
  if (cull(x, y, 30)) return;
  const t = state.time || 0;
  const r = Math.round((e.w || 16) / 2) + 4;
  g.fillStyle = Math.floor(t * 4) % 2 === 0 ? '#ffd75e' : '#c8a040';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + t;
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + 4 + Math.sin(a) * r * 0.45), 2, 1);
  }
  drawKey(g, x, y - Math.round((e.h || 16) / 2) - 10 - (Math.floor(t * 3) % 2));
}

// The quest tracker: three short lines under the clock, right-aligned.
// Returns the plate's box (the HUD's chrome record).
export function drawQuestTracker(g, state, right, top) {
  const qs = state.quests;
  if (!qs || !qs.length) return null;
  g.font = 'bold 7px monospace';
  g.textBaseline = 'top';
  const lines = qs.map(q => ({ text: questLine(q), done: q.done, closed: !q.done && !!q.closed }));
  const w = Math.ceil(Math.max(...lines.map(l => tw(g, l.text)))) + 12;
  const h = lines.length * 9 + 3;
  const x = right - w;
  g.fillStyle = 'rgba(8,10,14,0.72)'; g.fillRect(x, top, w, h);
  lines.forEach((l, i) => {
    const y = top + 2 + i * 9;
    // Done is green, closed (cannot be finished this run) is grey.
    g.fillStyle = l.done ? '#8fe0a0' : l.closed ? '#8a8f9a' : '#ffd75e';
    g.fillRect(x + 3, y + 2, 3, 3);
    if (!l.done) { g.fillStyle = '#000000'; g.fillRect(x + 4, y + 3, 1, 1); }
    g.textAlign = 'left';
    g.fillStyle = l.done ? '#8fe0a0' : l.closed ? '#8a8f9a' : '#e8e8f0';
    g.fillText(l.text, x + 9, y);
  });
  return { x, y: top, w, h };
}

// Map marks: the lever-to-yard link, the carrier (once seen) and the key.
// `at(wx, wy)` maps world to map px. Returns the marks drawn.
export function drawPoiMap(g, state, at) {
  const w = state.poi;
  const out = {};
  if (!w) return out;
  const lmFor = (site) => (state.atlas && state.atlas.landmarks || []).find(l => l.site === site);
  const known = (site) => { const l = site && lmFor(site); return !!(l && (l.seen || l.discovered)); };
  if (w.lever && w.yard && !w.closed && known(w.lever) && known(w.yard)) {
    // A dotted gold line from the lever to the yard.
    const [ax, ay] = at(w.lever.x, w.lever.y), [bx, by] = at(w.yard.x, w.yard.y);
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 4));
    g.fillStyle = w.yard.open ? '#8fe0a0' : '#c8a040';
    for (let i = 1; i < n; i += 2) g.fillRect(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), 1, 1);
    out.link = { ax, ay, bx, by };
  }
  if (w.carrier && w.carrierSeen && w.carrier.hp > 0) {
    const [mx, my] = at(w.carrier.x, w.carrier.y);
    drawKey(g, mx, my, '#ffd75e');
    out.carrier = { x: mx, y: my };
  }
  if (w.keyDrop) {
    const [mx, my] = at(w.keyDrop.x, w.keyDrop.y);
    drawKey(g, mx, my, '#fff0a0');
    out.key = { x: mx, y: my };
  }
  for (const s of state.secrets || []) {
    if (s.state !== 'spent' && !(s.kind === 'crack' && s.seen)) continue;
    // Secrets show only once found (a broken crack) or noticed.
    const [mx, my] = at(s.x, s.y);
    g.fillStyle = '#000000'; g.fillRect(mx - 2, my - 2, 5, 5);
    g.fillStyle = '#c87aff'; g.fillRect(mx - 1, my - 1, 3, 3);
    (out.secrets = out.secrets || []).push({ kind: s.kind, x: mx, y: my });
  }
  return out;
}
