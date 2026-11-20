// HORDES - src/end_card.js (R5: the end card, rebuilt once).
//
// The end of a run used to be a 13-line text dump. This module builds the
// summary in the order a player reads it:
//   1. how the run ended and what killed you, one line;
//   2. the gold this run banked, counting up into the bank;
//   3. what the run earned: trophies as their emblems, free unlocks and new
//      threats as small cards;
//   4. a tidy block with everything else the card said before (time, wave,
//      level, kills, the hand, the gold's parts, quests, the auto-continue cut,
//      the tip). Nothing a player could read before is lost.
// main.js owns the data, the canvases and the clock; this file only turns a
// plain model into markup and holds the count's timing. No DOM, no state.

// The count. It waits a moment so the eye lands on the card, then counts for
// COUNT_S with an ease-out (fast first, settling on the number). The goldBank
// cue's bell rings 0.36 s into the cue, so the cue starts that much before the
// count ends: the bell lands with the final number.
export const COUNT_DELAY_S = 0.2;
export const COUNT_S = 1.0;
export const BANK_BELL_S = 0.36;
export const COUNT_END_S = COUNT_DELAY_S + COUNT_S;
export const COUNT_CUE_AT_S = COUNT_END_S - BANK_BELL_S;

/** How much of `total` shows `t` seconds after the card came up. */
export function countShown(total, t) {
  const n = Math.max(0, Math.round(Number(total) || 0));
  if (!(t > COUNT_DELAY_S)) return 0;
  if (t >= COUNT_END_S) return n;
  const k = (t - COUNT_DELAY_S) / COUNT_S;
  return Math.min(n, Math.round(n * (1 - (1 - k) * (1 - k))));
}

/** The two numbers on the card at time t: the run's gold and the bank it fills. */
export function countFrame(gold, bank, t) {
  const g = countShown(gold, t);
  const full = Math.max(0, Math.round(Number(gold) || 0));
  return { gold: g, bank: Math.round(Number(bank) || 0) - full + g };
}

/**
 * The BUY NEXT card's words. `goal` is { name, cost } (main.js
 * bestNextPurchase), `gold` the bank after the run. Null when nothing is left.
 */
export function buyNextWords(goal, gold) {
  if (!goal) return null;
  const gap = goal.cost - (Number(gold) || 0);
  return {
    name: 'BUY NEXT',
    desc: goal.name + ', ' + goal.cost + ' gold · ' + (gap > 0 ? gap + ' more to go' : 'you can afford it'),
    afford: gap <= 0,
  };
}

const item = (cls, art, cap, name) =>
  `<span class="ec-item ${cls}">${art}<span class="ec-cap">${cap}</span><span class="ec-nm">${name}</span></span>`;

/**
 * The summary's markup. The model:
 *   tags     string[]   AUTO-CONTINUE, ASSISTED, APEX RUN, the stage journey
 *   lead     string     how the run ended in words ('' for a plain death)
 *   cause    string|null  the killer, as deathCauseLabel words
 *   gold, bank, firstClear
 *   trophies [{ id, name }]          emblems, painted by main.js (data-trophy)
 *   unlocks  [{ kind, id, label }]   free unlocks (data-shop / data-pilot)
 *   threats  string[]                new elite modifiers, as their rule
 *   stats    string    TIME / WAVE / LEVEL / KILLS (and the hand)
 *   parts    string[]  the gold's parts, quests, the auto-continue cut
 *   buyLine  string    BUY NEXT as words, while the tutorial owes its shop lesson
 *   tip      string
 */
export function endCardHtml(m) {
  let h = '<div class="ec">';
  if (m.tags && m.tags.length) h += `<div class="ec-tags">${m.tags.map(t => `<span class="cause">${t}</span>`).join(' · ')}</div>`;
  // The first line: how it ended, then who did it.
  const how = [];
  if (m.lead) how.push(`<span class="ec-lead">${m.lead}</span>`);
  if (m.cause) how.push(`<span class="cause">KILLED BY ${m.cause}</span>`);
  if (how.length) h += `<div class="ec-how">${how.join(' · ')}</div>`;
  // The gold, counting into the bank. The markup holds the final numbers:
  // the count rewrites the two numbers while it runs.
  h += '<div class="ec-gold earn">' +
    `<div class="ec-earned">GOLD EARNED: +${m.gold}</div>` +
    `<div class="ec-bankline"><span class="ec-bank">BANK ${m.bank}</span>` +
    (m.firstClear ? ' · <span class="ec-best">NEW BEST TIME!</span>' : '') + '</div></div>';
  // What the run earned or brought.
  const got = [];
  for (const t of m.trophies || []) {
    got.push(item('ec-trophy', `<canvas class="ec-icon" width="32" height="32" data-trophy="${t.id}"></canvas>`, 'TROPHY', t.name));
  }
  for (const u of m.unlocks || []) {
    const art = u.kind === 'shopRow' ? `<canvas class="ec-icon ec-sm" width="16" height="16" data-shop="${u.id}"></canvas>`
      : u.kind === 'character' ? `<canvas class="ec-icon ec-sm" width="32" height="32" data-pilot="${u.id}"></canvas>` : '';
    got.push(item('ec-unlock', art, 'UNLOCKED, FREE', u.label));
  }
  for (const line of m.threats || []) got.push(item('ec-threat', '', 'NEW THREAT', line));
  if (got.length) h += `<div class="ec-got">${got.join('')}</div>`;
  // Everything else, quieter.
  let more = '';
  if (m.stats) more += `<div class="ec-stats">${m.stats}</div>`;
  for (const p of m.parts || []) more += `<div class="pool">${p}</div>`;
  if (m.buyLine) more += `<div class="next">${m.buyLine}</div>`;
  if (m.tip) more += `<div class="next">${m.tip}</div>`;
  if (more) h += `<div class="ec-more">${more}</div>`;
  return h + '</div>';
}
