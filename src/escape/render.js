// HORDES — V1 escape RENDER: side-view draw in the SAME virtual 480x300 the
// overhead renderer maps onto the backing store (the transform is already set
// by renderer.resize; integer pixels, no smoothing, no second coordinate
// system). Everything the player MUST be able to see is drawn: the wall (the
// real timer), every gap edge before it is crossed, the boss's telegraph, the
// portal beacon, and the SKIP affordance from the FIRST frame.
import { VIEW_W, VIEW_H, BAND, THREATS, EXIT } from './config.js';
import { pressure } from './sim.js';

// Palette (matches the game's dark field art).
const C_BG = '#0e0e16';
const C_PLAT = '#3a3a52';
const C_PLAT_TOP = '#5a5a7e';
const C_WALL = '#7a2430';
const C_WALL_EDGE = '#b04050';
const C_PLAYER = '#e8e8f0';
const C_PURSUER = '#c05050';
const C_FLIER = '#8060c0';
const C_SHOT = '#f0d060';
const C_BOSS = '#904858';
const C_TELEGRAPH = '#e06050';
const C_BEACON = '#60e0c0';
const C_TEXT = '#b8b8cc';

// The runner sits a third in from the left; the corridor scrolls under it.
const CAM_LEAD = 150;

// The skip affordance: a real hit-testable rect, visible from frame one.
export const SKIP_RECT = { x: VIEW_W - 92, y: 8, w: 84, h: 26 };
export function skipHit(px, py) {
  return px >= SKIP_RECT.x && px <= SKIP_RECT.x + SKIP_RECT.w &&
         py >= SKIP_RECT.y && py <= SKIP_RECT.y + SKIP_RECT.h;
}

export function draw(ctx, sim, opts = {}) {
  const p = sim.player;
  const camX = Math.max(0, p.x - CAM_LEAD);
  const w2s = (x) => Math.round(x - camX);          // world -> virtual screen x

  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // ---- terrain: only the spans on screen (integer pixels) -----------------
  for (const pl of sim.plats) {
    const x0 = w2s(pl.x), x1 = w2s(pl.x + pl.w);
    if (x1 < 0 || x0 > VIEW_W) continue;
    const top = Math.round(pl.y);
    ctx.fillStyle = C_PLAT;
    ctx.fillRect(x0, top, x1 - x0, BAND.KILL_Y - top);
    ctx.fillStyle = C_PLAT_TOP;
    ctx.fillRect(x0, top, x1 - x0, 3);
    // The lip: a 2px bright edge on BOTH sides of every gap — the no-blind-
    // drops rule. A runner can always see the hole ahead (acceptance #9).
    ctx.fillStyle = '#8a8ab0';
    ctx.fillRect(x0, top, 2, 8);
    ctx.fillRect(x1 - 2, top, 2, 8);
  }
  // Destroyed terrain scars (the boss's wake — the pressure story, visible).
  ctx.fillStyle = '#221218';
  for (const pl of sim.destroyedPlats) {
    const x0 = w2s(pl.x), x1 = w2s(pl.x + pl.w);
    if (x1 < 0 || x0 > VIEW_W) continue;
    ctx.fillRect(x0, Math.round(pl.y), x1 - x0, 4);
  }

  // ---- the exit portal beacon (P1's rules; a pillar visible from afar) -----
  const bx = w2s(sim.corridor.portalX);
  if (bx > -40 && bx < VIEW_W + 40) {
    ctx.fillStyle = C_BEACON;
    ctx.fillRect(bx - 2, BAND.FLOOR_Y - EXIT.BEACON_H, 4, EXIT.BEACON_H);
    ctx.fillRect(bx - 8, BAND.FLOOR_Y - EXIT.BEACON_H, 16, 6);
  }

  // ---- the boss body + its telegraph ---------------------------------------
  if (sim.boss) {
    const b = sim.boss;
    const bx0 = w2s(b.x - THREATS.BOSS_W / 2);
    if (bx0 < VIEW_W + 60) {
      ctx.fillStyle = C_BOSS;
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, THREATS.BOSS_H);
      ctx.fillStyle = '#583040';
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, 6);
      // TELEGRAPH: a striped bar over the platform it is about to tear out —
      // never subtle, always ahead of the runner's current x.
      if (b.telegraph > 0 && b.target) {
        const tx0 = w2s(b.target.x), tx1 = w2s(b.target.x + b.target.w);
        ctx.fillStyle = C_TELEGRAPH;
        for (let x = Math.max(0, tx0); x < Math.min(VIEW_W, tx1); x += 12) {
          ctx.fillRect(x, b.target.y - 10, 6, 4);
        }
      }
    }
  }

  // ---- threats --------------------------------------------------------------
  ctx.fillStyle = C_PURSUER;
  for (const pu of sim.pursuers) {
    const x = w2s(pu.x);
    if (x < -12 || x > VIEW_W + 12) continue;
    ctx.fillRect(x - THREATS.PURSUER_R, Math.round(pu.y) - THREATS.PURSUER_R * 2,
      THREATS.PURSUER_R * 2, THREATS.PURSUER_R * 2);
  }
  ctx.fillStyle = C_FLIER;
  for (const fl of sim.fliers) {
    const x = w2s(fl.x);
    if (x < -12 || x > VIEW_W + 12) continue;
    ctx.fillRect(x - THREATS.FLIER_R, Math.round(fl.y) - THREATS.FLIER_R / 2,
      THREATS.FLIER_R * 2, THREATS.FLIER_R);
  }
  ctx.fillStyle = C_SHOT;
  for (const s of sim.shots) {
    const x = w2s(s.x);
    if (x < -12 || x > VIEW_W + 12) continue;
    ctx.fillRect(x - 2, Math.round(s.y) - 2, 5, 3);
  }

  // ---- the horde wall (the real timer, always visible when in range) -------
  const wEdge = w2s(sim.wall.x + 46);
  if (wEdge > -20) {
    ctx.fillStyle = C_WALL;
    ctx.fillRect(0, 0, Math.min(wEdge, VIEW_W), VIEW_H);
    ctx.fillStyle = C_WALL_EDGE;
    ctx.fillRect(Math.max(0, wEdge - 4), 0, 4, VIEW_H);
  }

  // ---- the runner (side-view: a lithe 8x14 block with a face direction) ----
  const px = w2s(p.x), py = Math.round(p.y);
  ctx.fillStyle = C_PLAYER;
  ctx.fillRect(px - 4, py - 14, 8, 14);
  if (p.dashT > 0) {                                    // the dash tell
    ctx.fillStyle = '#9090c0';
    ctx.fillRect(px - 4 - 8 * p.dir, py - 10, 8, 6);
  }

  // ---- readouts (integer pixel text, no anti-aliased floats) ---------------
  ctx.fillStyle = C_TEXT;
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  const secs = Math.floor(sim.t);
  ctx.fillText('ESCAPE ' + String(Math.floor(secs / 60)).padStart(2, '0') + ':' +
    String(secs % 60).padStart(2, '0'), 8, 8);
  ctx.fillText('WALL ' + Math.round(pressure(sim)) + 'px', 8, 22);

  // ---- the skip affordance (frame one, every frame) ------------------------
  ctx.fillStyle = '#26263a';
  ctx.fillRect(SKIP_RECT.x, SKIP_RECT.y, SKIP_RECT.w, SKIP_RECT.h);
  ctx.strokeStyle = '#4a4a66';
  ctx.strokeRect(SKIP_RECT.x + 0.5, SKIP_RECT.y + 0.5, SKIP_RECT.w - 1, SKIP_RECT.h - 1);
  ctx.fillStyle = opts.paidSkip ? '#80d0a0' : C_TEXT;
  ctx.fillText(opts.paidSkip ? 'SKIP +PAY' : 'SKIP', SKIP_RECT.x + 22, SKIP_RECT.y + 8);

  // ---- the outcome card (the soft-fail story: no death screen) -------------
  if (sim.outcome) {
    ctx.fillStyle = 'rgba(14,14,22,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = C_TEXT;
    ctx.font = '16px monospace';
    const line = sim.outcome === 'complete' ? 'ESCAPED'
      : sim.outcome === 'caught' ? 'CAUGHT — no payout, run continues'
        : sim.outcome === 'fell' ? 'FELL — no payout, run continues'
          : 'SKIPPED';
    ctx.fillText(line, Math.round((VIEW_W - line.length * 9) / 2), 132);
    ctx.font = '10px monospace';
    const sub = opts.outcomeSub || '';
    if (sub) ctx.fillText(sub, Math.round((VIEW_W - sub.length * 6) / 2), 156);
  }
}
