// HORDES — src/sites.js
//
// M5b SITES: the seeded points of interest on a stage's map.
//
//   shrine   stand in its ring while it charges; then pick 1 of 3 blessings
//   altar    step on it to call the wave boss now; that boss pays an extra chest
//   brazier  breakable (urn on some stages): small gold, sometimes a potion,
//            rarely a magnet pull
//   fountain stand in it while hurt: a one-time heal
//   statue   touch it to take a stated curse for the wave; the stated reward
//            pays when the wave's boss falls
//
// Pure rules + data: no DOM, no canvas, no Math.random. Placement is a pure
// function of (seed, stage, building rects); the run's drops roll on their
// own stream (siteRng), so the sites never shift the spawn/draft streams
// the balance numbers were measured on. main.js owns the effects that need
// the game (offers, chests, boss summon, pickups); this module owns where the
// sites are, their state machine and what they pay.

import { planPath } from './pilot_nav.js';
import { terrainFor, flatSpot, crownSpot } from './terrain.js';
import { CONFIG as C } from './config.js';

// ---------- tuning ----------
export const SITES = {
  COUNTS: { shrine: 3, altar: 1, fountain: 2, statue: 1 },
  BRAZIER_CLUSTERS: 5,       // clusters of 3-4 breakables
  MIN_GAP: 260,              // px between two major sites
  CLUSTER_GAP: 160,          // px between a cluster and any other site
  SPAWN_CLEAR: 170,          // px kept free around the hero's start (spawnDist)
  // The first shrine of every run stands this far from the start: close enough
  // to find in the first calm seconds, outside the spawn clearing.
  WELCOME_MIN: 200, WELCOME_MAX: 300,
  RIM_MARGIN: 90,            // px inside the rim
  BUILDING_MARGIN: 26,       // px from any building footprint
  SHRINE_R: 34,              // charge ring radius
  SHRINE_CHARGE_S: 4,        // seconds of standing to charge
  FOUNTAIN_R: 22,
  FOUNTAIN_STAND_S: 1,       // seconds of standing to drink
  FOUNTAIN_HEAL: 0.35,       // fraction of max HP
  ALTAR_R: 16,
  STATUE_R: 16,
  STATUE_PROMPT_R: 80,       // the curse/reward card shows inside this range
  BRAZIER_HIT_R: 10,         // a projectile this close breaks it
  BRAZIER_TOUCH_R: 14,       // the hero walking into it breaks it too
  // Drops of one breakable (hands-off).
  GOLD_MIN: 2, GOLD_MAX: 5,
  POTION_CHANCE: 0.10,
  MAGNET_CHANCE: 0.03,
  // Hands-on: steering within this many seconds counts.
  HANDS_ON_S: 2,
  HANDS_ON_CHARGE: 1.4,      // shrine charges 40% faster
  HANDS_ON_DROPS: 1.5,       // breakables drop 50% more
};

// The cursed statue's deals: a curse for the wave, a reward at its end.
export const CURSES = [
  { id: 'swift', curse: 'Enemies +50% speed', reward: 'A joker', speedMult: 1.5, hpMult: 1, pay: 'joker' },
  { id: 'tough', curse: 'Enemies +60% HP', reward: 'Two chests', speedMult: 1, hpMult: 1.6, pay: 'chests' },
];

export const SITE_KINDS = ['shrine', 'altar', 'brazier', 'fountain', 'statue'];
// One sentence per site (the first-time hints read these).
export const SITE_HINTS = {
  shrine: 'Stand in the ring to charge a blessing; steering charges it 40% faster.',
  altar: 'Step on the altar to call the wave boss now and win an extra chest (waves 1-4).',
  brazier: 'Break braziers for gold and the odd potion; steering finds 50% more.',
  fountain: 'Stand in a fountain while hurt to heal once.',
  statue: 'Touch the statue to take its curse for this wave and win its reward.',
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over the stage id, mixed with the seed: the placement stream.
export function siteSeed(seed, stageId) {
  let h = 0x811c9dc5 ^ (seed | 0);
  const s = String(stageId || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h ^ 0x5173) | 0;
}

// Distance from the hero's start (startRun puts the hero at the view's
// centre). Every spawn clearance in the world placement is measured from here.
export function spawnDist(x, y) {
  return Math.hypot(x - C.VIEW_W / 2, y - C.VIEW_H / 2);
}

function inRects(rects, x, y, m) {
  for (const q of rects) {
    if (x > q.x - m && x < q.x + q.w + m && y > q.y - m && y < q.y + q.h + m) return true;
  }
  return false;
}

// Place every site for (seed, stage). `rects` = the stage's building
// footprints; `rim` = the arena half-size. Each site stands clear of the
// buildings, apart from the others, out of the spawn clearing, and has a
// walkable route from the spawn (pilot_nav's planner).
export function placeSites(seed, stageId, rects = [], rim = 900, opts = {}) {
  const S = SITES;
  const rng = mulberry32(siteSeed(seed, stageId));
  const half = rim - S.RIM_MARGIN;
  const out = [];
  const sx = C.VIEW_W / 2, sy = C.VIEW_H / 2;   // the hero's start
  const routeOk = (x, y) => rects.length === 0 || !!planPath(rects, sx, sy, x, y);
  // M5b LANDSCAPE: sites stand on flat, reachable ground (no ramp, bridge or
  // cliff edge within a cell); the boss altar takes the layout's crown.
  const TER = terrainFor(seed, stageId);
  const free = (x, y, gap, m = S.BUILDING_MARGIN) => {
    if (spawnDist(x, y) < S.SPAWN_CLEAR) return false;
    if (TER && !flatSpot(TER, x, y)) return false;
    if (inRects(rects, x, y, m)) return false;
    for (const o of out) if (Math.hypot(o.x - x, o.y - y) < gap) return false;
    return true;
  };
  const pick = (gap) => {
    for (let tries = 0; tries < 80; tries++) {
      const x = Math.round((rng() * 2 - 1) * half);
      const y = Math.round((rng() * 2 - 1) * half);
      if (free(x, y, gap) && routeOk(x, y)) return [x, y];
    }
    return null;
  };
  // The welcome shrine: a spot on the ring around the start.
  const pickNearStart = (gap) => {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2;
      const r = S.WELCOME_MIN + rng() * (S.WELCOME_MAX - S.WELCOME_MIN);
      const x = Math.round(sx + Math.cos(a) * r), y = Math.round(sy + Math.sin(a) * r);
      if (Math.abs(x) > half || Math.abs(y) > half) continue;
      if (free(x, y, gap) && routeOk(x, y)) return [x, y];
    }
    return null;
  };
  const counts = { ...S.COUNTS, ...(opts.counts || {}) };
  let id = 0;
  const urns = /SNOW|BONE|VOID|WHITE/i.test(String(stageId));
  for (const kind of ['altar', 'statue', 'shrine', 'fountain']) {
    for (let i = 0; i < counts[kind]; i++) {
      let at = null;
      if (kind === 'altar' && i === 0 && TER) {
        const cr = crownSpot(TER);
        if (cr) {
          const ax = Math.round(cr.x), ay = Math.round(cr.y + 30);
          if (free(ax, ay, S.MIN_GAP) && routeOk(ax, ay)) at = [ax, ay];
        }
      }
      if (!at && kind === 'shrine' && i === 0) at = pickNearStart(S.CLUSTER_GAP);
      if (!at) at = pick(S.MIN_GAP);
      if (!at) continue;
      const s = { id: id++, kind, x: at[0], y: at[1], state: 'unused' };
      if (kind === 'shrine') { s.charge = 0; s.handsOn = false; }
      if (kind === 'fountain') s.stand = 0;
      if (kind === 'statue') s.deal = CURSES[Math.floor(rng() * CURSES.length)];
      out.push(s);
    }
  }
  const clusters = opts.clusters ?? S.BRAZIER_CLUSTERS;
  for (let c = 0; c < clusters; c++) {
    const at = pick(S.CLUSTER_GAP);
    if (!at) continue;
    const n = 3 + (rng() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng() * 0.6;
      const r = 14 + Math.round(rng() * 10);
      const x = Math.round(at[0] + Math.cos(a) * r), y = Math.round(at[1] + Math.sin(a) * r);
      if (inRects(rects, x, y, 12) || spawnDist(x, y) < S.SPAWN_CLEAR) continue;
      if (TER && !flatSpot(TER, x, y)) continue;
      out.push({ id: id++, kind: 'brazier', x, y, state: 'unused', cluster: c, urn: urns });
    }
  }
  return out;
}

// Is a site still worth walking to?
export function siteOpen(s) {
  if (s.state === 'spent') return false;
  if (s.kind === 'statue') return s.state === 'unused';
  return true;
}

// The drops of one breakable. Hands-on scales the gold and the chances.
export function rollBreakDrops(rng, handsOn = false) {
  const S = SITES;
  const m = handsOn ? S.HANDS_ON_DROPS : 1;
  const out = [];
  const gold = S.GOLD_MIN + Math.floor(rng() * (S.GOLD_MAX - S.GOLD_MIN + 1));
  out.push({ kind: 'gold', amount: Math.round(gold * m) });
  if (rng() < S.POTION_CHANCE * m) out.push({ kind: 'potion' });
  if (rng() < S.MAGNET_CHANCE * m) out.push({ kind: 'magnet' });
  return out;
}

// One frame of the site rules. `ctx`:
//   player {x,y,hp,maxHp}, dt, handsOn (bool), projectiles [{x,y}],
//   canSummon () => bool (no boss alive, no portal), canCurse () => bool (the
//   wave's boss has not fallen yet), rng (the site stream),
//   goalSite (the site the pilot was sent to), manual (MANUAL pilot),
//   blocked (bool: no interaction this frame, e.g. the guided run).
// Returns events for main.js:
//   shrineDone {site, handsOn} · altar {site} · altarQuiet {site}
//   break {site, drops, handsOn} · fountain {site, heal} · curse {site}
export function tickSites(sites, ctx) {
  const ev = [];
  if (!sites || !ctx || ctx.blocked) return ev;
  const S = SITES;
  const p = ctx.player;
  const near = (s, r) => (s.x - p.x) ** 2 + (s.y - p.y) ** 2 <= r * r;
  // The altar and the statue never fire by accident: the hero must be
  // steering, or the pilot must have been sent to that site (a waypoint, or
  // EXPLORE's altar rule).
  const deliberate = (s) => !!ctx.handsOn || (ctx.goalSite != null && ctx.goalSite === s) || ctx.manual === true;
  for (const s of sites) {
    if (s.state === 'spent') continue;
    // Far sites skip the rules (cheap bound: the screen is 480x300).
    if (Math.abs(s.x - p.x) > 320 || Math.abs(s.y - p.y) > 220) continue;
    switch (s.kind) {
      case 'shrine': {
        if (!near(s, S.SHRINE_R)) break;
        s.state = 'active';
        if (ctx.handsOn) s.handsOn = true;
        s.charge = Math.min(1, s.charge + ctx.dt * (ctx.handsOn ? S.HANDS_ON_CHARGE : 1) / S.SHRINE_CHARGE_S);
        if (s.charge >= 1) { s.state = 'spent'; ev.push({ kind: 'shrineDone', site: s, handsOn: s.handsOn }); }
        break;
      }
      case 'altar': {
        // Only a deliberate visit counts: steering, or the pilot sent there.
        if (!near(s, S.ALTAR_R) || !deliberate(s)) { s.quietShown = false; break; }
        if (ctx.canSummon && ctx.canSummon()) { s.state = 'spent'; ev.push({ kind: 'altar', site: s }); }
        else if (!s.quietShown) { s.quietShown = true; ev.push({ kind: 'altarQuiet', site: s }); }
        break;
      }
      case 'fountain': {
        if (!near(s, S.FOUNTAIN_R) || p.hp >= p.maxHp - 0.5) { s.stand = 0; break; }
        s.stand += ctx.dt;
        if (s.stand >= S.FOUNTAIN_STAND_S) {
          s.state = 'spent';
          ev.push({ kind: 'fountain', site: s, heal: S.FOUNTAIN_HEAL * p.maxHp });
        }
        break;
      }
      case 'statue': {
        if (s.state !== 'unused' || !near(s, S.STATUE_R) || !deliberate(s)) break;
        // The curse is for this wave and its boss pays the reward: no deal
        // once that boss is down (the statue wakes again next wave).
        if (ctx.canCurse && !ctx.canCurse()) break;
        s.state = 'active';
        ev.push({ kind: 'curse', site: s });
        break;
      }
      case 'brazier': {
        let hit = near(s, S.BRAZIER_TOUCH_R);
        if (!hit && ctx.projectiles) {
          const r2 = S.BRAZIER_HIT_R * S.BRAZIER_HIT_R;
          for (const q of ctx.projectiles) {
            if ((q.x - s.x) ** 2 + (q.y - s.y) ** 2 <= r2) { hit = true; break; }
          }
        }
        if (hit) {
          s.state = 'spent';
          ev.push({ kind: 'break', site: s, handsOn: !!ctx.handsOn,
            drops: rollBreakDrops(ctx.rng || Math.random, !!ctx.handsOn) });
        }
        break;
      }
    }
  }
  return ev;
}

// The cursed statue held this wave (null when none).
export function activeCurse(sites) {
  if (!sites) return null;
  for (const s of sites) if (s.kind === 'statue' && s.state === 'active') return s;
  return null;
}

// Per-run counts for the sim and the end card.
// `before` (optional) is the tally of the run's earlier fields: it is added in.
export function sitesUsed(sites, before = null) {
  const n = { shrine: 0, altar: 0, brazier: 0, fountain: 0, statue: 0, total: 0 };
  for (const k of Object.keys(before || {})) n[k] = (n[k] || 0) + (before[k] | 0);
  for (const s of sites || []) {
    if (s.state === 'unused') continue;
    if (s.kind === 'shrine' && s.state !== 'spent') continue;
    n[s.kind] = (n[s.kind] || 0) + 1; n.total++;
  }
  return n;
}
