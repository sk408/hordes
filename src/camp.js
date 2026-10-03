// HORDES — THE CAMP.
// Four buildings on the title screen, bought with gold, that produce over
// REAL time whether or not the game is open. Production is worked out from
// timestamps when the player looks, and each building stops at a storage
// limit, so the camp rewards checking in rather than leaving it for a week.
// Pure data and arithmetic: no DOM, no clock of its own (callers pass `now`).
//
//   profile.camp = {
//     levels:  { mine, forge, library, shrine }   0 = not built
//     since:   { mine, forge, library, shrine }   epoch ms production counts from
//     charges: { forge, library, shrine }         collected, waiting for the next run
//     pulled:  { id: true }                       only once a stamp was pulled back
//   }
//
// THE CLOCK. Production counts from a building's `since` stamp, and the stamp
// does not move back: a clock set forward and back again is never paid twice
// for the same time, the building waits until the clock passes its stamp.
// One exception, once per building: a stamp more than CAMP_CLOCK_SLACK_H ahead
// of the clock was written by a wrong clock (or came with an imported save),
// so the first look restarts the count at the clock instead of stopping the
// building for that long. camp.pulled lists the buildings that have used it;
// a second stamp ahead of the clock waits, whatever its size.

const HOUR_MS = 3600 * 1000;

// The gold mine stores at most this many hours of gold.
export const CAMP_STORE_HOURS = 8;
// A stamp further ahead of the clock than this was written by a wrong clock.
export const CAMP_CLOCK_SLACK_H = 1;

// kind 'gold': `rate` gold an hour, stored up to CAMP_STORE_HOURS.
// kind 'charge': one charge every `hours`; the building holds one, and the
// player holds one more for the next run.
export const CAMP_BUILDINGS = [
  { id: 'mine', name: 'GOLD MINE', kind: 'gold',
    blurb: 'Digs gold every hour, even while the game is closed.',
    levels: [
      { cost: 400, rate: 150 },
      { cost: 1200, rate: 300 },
      { cost: 3000, rate: 500 },
      { cost: 7000, rate: 750 },
      { cost: 15000, rate: 1000 },
    ] },
  { id: 'forge', name: 'FORGE', kind: 'charge',
    blurb: 'When charged, your first weapon starts the next run one level higher.',
    levels: [
      { cost: 800, hours: 8 },
      { cost: 3000, hours: 4 },
      { cost: 9000, hours: 2 },
    ] },
  { id: 'library', name: 'LIBRARY', kind: 'charge',
    blurb: 'When charged, the next run gets one free reroll.',
    levels: [
      { cost: 600, hours: 8 },
      { cost: 2400, hours: 4 },
      { cost: 7000, hours: 2 },
    ] },
  { id: 'shrine', name: 'SHRINE', kind: 'charge',
    blurb: 'When charged, the next run opens with a joker offer.',
    levels: [
      { cost: 2000, hours: 12 },
      { cost: 6000, hours: 8 },
      { cost: 15000, hours: 4 },
    ] },
];
export const CAMP_IDS = CAMP_BUILDINGS.map(b => b.id);
export const CAMP_CHARGE_IDS = CAMP_BUILDINGS.filter(b => b.kind === 'charge').map(b => b.id);
const BY_ID = Object.fromEntries(CAMP_BUILDINGS.map(b => [b.id, b]));
export function campBuilding(id) { return BY_ID[id] || null; }

/** An empty camp (a fresh profile, or an old save). */
export function emptyCamp() {
  return {
    levels: { mine: 0, forge: 0, library: 0, shrine: 0 },
    since: { mine: 0, forge: 0, library: 0, shrine: 0 },
    charges: { forge: 0, library: 0, shrine: 0 },
  };
}

/** A clean camp from any saved value. Returns { camp, dirty }. */
export function sanitizeCamp(raw) {
  const camp = emptyCamp();
  if (raw === undefined) return { camp, dirty: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { camp, dirty: true };
  let dirty = false;
  const int = (v, max) => {
    const n = Number(v);
    const out = Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
    if (out !== v) dirty = true;
    return out;
  };
  const part = (k) => (raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k]) ? raw[k] : (dirty = true, {}));
  const levels = part('levels'), since = part('since'), charges = part('charges');
  for (const b of CAMP_BUILDINGS) {
    camp.levels[b.id] = int(levels[b.id], b.levels.length);
    camp.since[b.id] = int(since[b.id], Number.MAX_SAFE_INTEGER);
    if (b.kind === 'charge') camp.charges[b.id] = int(charges[b.id], 1);
  }
  // The optional block: only `true` flags of real buildings are kept.
  if (raw.pulled !== undefined) {
    const pulled = part('pulled');
    for (const id of Object.keys(pulled)) {
      if (BY_ID[id] && pulled[id] === true) (camp.pulled || (camp.pulled = {}))[id] = true;
      else dirty = true;
    }
  }
  return { camp, dirty };
}

function campOf(profile) {
  if (!profile.camp) profile.camp = emptyCamp();
  return profile.camp;
}
export function campLevel(profile, id) { return (profile.camp && profile.camp.levels[id]) || 0; }
function levelDef(b, level) { return level > 0 ? b.levels[level - 1] : null; }

// The clock time building `id` counts from, as of `now` (see THE CLOCK above).
// A stamp ahead of the clock makes nothing until the clock passes it, except
// for the one pull-back each building has.
function countFrom(camp, id, now) {
  // A built building with no stamp (a repaired save) starts counting now.
  if (!(camp.since[id] > 0)) { camp.since[id] = now; return now; }
  const since = camp.since[id];
  if (since - now > CAMP_CLOCK_SLACK_H * HOUR_MS && !(camp.pulled && camp.pulled[id])) {
    (camp.pulled || (camp.pulled = {}))[id] = true;
    camp.since[id] = now;
    return now;
  }
  return since;
}
// Restart building `id`'s count at `now` (a collect or a purchase): forward only.
function restartCount(camp, id, now) {
  if (now >= (camp.since[id] || 0)) camp.since[id] = now;
}

/** The next level's price, or null at max. */
export function campNextCost(profile, id) {
  const b = BY_ID[id];
  const lv = campLevel(profile, id);
  return b && lv < b.levels.length ? b.levels[lv].cost : null;
}

/**
 * What each building has made by `now` and not yet handed over:
 *   { gold, goldFull, forge, library, shrine, progress: { id: 0..1 } }
 * A charge building counts as ready (1) only while the player does not
 * already hold that charge. A look is also what spends a building's one
 * pull-back (see THE CLOCK above).
 */
export function campPending(profile, now) {
  const camp = profile.camp || emptyCamp();
  const out = { gold: 0, goldFull: false, forge: 0, library: 0, shrine: 0, progress: {} };
  for (const b of CAMP_BUILDINGS) {
    const def = levelDef(b, camp.levels[b.id]);
    if (!def) { out.progress[b.id] = 0; continue; }
    const hours = Math.max(0, (now - countFrom(camp, b.id, now)) / HOUR_MS);
    if (b.kind === 'gold') {
      const h = Math.min(CAMP_STORE_HOURS, hours);
      out.gold = Math.floor(h * def.rate);
      out.goldFull = hours >= CAMP_STORE_HOURS;
      out.progress[b.id] = h / CAMP_STORE_HOURS;
    } else {
      const k = Math.min(1, hours / def.hours);
      out.progress[b.id] = k;
      out[b.id] = k >= 1 && !(camp.charges[b.id] > 0) ? 1 : 0;
    }
  }
  return out;
}
export function campHasStock(pending) {
  return !!pending && (pending.gold > 0 || pending.forge > 0 || pending.library > 0 || pending.shrine > 0);
}
/** One line per thing waiting, for the away summary and the title. */
export function campStockLines(pending) {
  const lines = [];
  if (!pending) return lines;
  if (pending.gold > 0) {
    lines.push('Gold Mine: +' + pending.gold.toLocaleString('en-US') + ' gold' + (pending.goldFull ? ' (full)' : ''));
  }
  if (pending.forge) lines.push('Forge: your first weapon starts one level higher');
  if (pending.library) lines.push('Library: one free reroll');
  if (pending.shrine) lines.push('Shrine: a joker offer at the start');
  return lines;
}

/**
 * Take everything that is ready: gold goes to the bank, charges are held for
 * the next run. Returns { any, gold, forge, library, shrine }.
 */
export function campCollect(profile, now) {
  const camp = campOf(profile);
  const p = campPending(profile, now);
  const got = { any: false, gold: p.gold, forge: p.forge, library: p.library, shrine: p.shrine };
  if (p.gold > 0) {
    profile.gold = Math.min(Number.MAX_SAFE_INTEGER, (profile.gold || 0) + p.gold);
    restartCount(camp, 'mine', now);
    got.any = true;
  }
  for (const id of CAMP_CHARGE_IDS) {
    if (!p[id]) continue;
    camp.charges[id] = 1;
    restartCount(camp, id, now);
    got.any = true;
  }
  return got;
}

/**
 * Buy the next level. What the building had made is collected first, so an
 * upgrade never throws production away. Returns { ok, cost, reason }.
 */
export function campBuy(profile, id, now) {
  const b = BY_ID[id];
  const cost = campNextCost(profile, id);
  if (!b || cost === null) return { ok: false, reason: 'max' };
  if ((profile.gold || 0) < cost) return { ok: false, reason: 'gold', cost };
  const camp = campOf(profile);
  if (camp.levels[id] > 0) campCollect(profile, now);
  profile.gold -= cost;
  camp.levels[id] += 1;
  if (camp.levels[id] === 1 || b.kind === 'gold') restartCount(camp, id, now);
  return { ok: true, cost };
}

/** The run start spends the held charges. Returns { forge, library, shrine }. */
export function campSpendCharges(profile) {
  const camp = campOf(profile);
  const out = {};
  for (const id of CAMP_CHARGE_IDS) {
    out[id] = camp.charges[id] > 0 ? 1 : 0;
    camp.charges[id] = 0;
  }
  return out;
}

/** What the building makes at its current (or first) level, in plain words. */
export function campRateText(profile, id) {
  const b = BY_ID[id];
  const def = levelDef(b, Math.max(1, campLevel(profile, id)));
  return b.kind === 'gold'
    ? def.rate + ' gold an hour, holds ' + CAMP_STORE_HOURS + ' hours'
    : 'charges in ' + def.hours + ' hours';
}

/** Total price of every level of every building. */
export function campTotalCost() {
  return CAMP_BUILDINGS.reduce((s, b) => s + b.levels.reduce((t, l) => t + l.cost, 0), 0);
}
