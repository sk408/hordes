// HORDES - THE MESSAGE LANE (R3: a smaller HUD).
//
// toast() in main.js is the one stream of short run messages. The HUD shows
// them in ONE lane under the vitals block, at most LANE_LINES lines tall.
// Two rules live here, so the stream and the painter agree:
//
// 1. Rank. Each message gets a rank from its text (toastRank). A portal, a
//    boss or a finished quest ranks 2, the wave and stage lines rank 1,
//    everything else (pickups, tips, level-ups) ranks 0.
// 2. Nothing is pushed out by a lesser line. When the stream is full, the
//    lowest-ranked line goes first (the oldest of those). A new line that
//    ranks below everything already held is dropped instead.
//
// laneLines() then picks what the lane paints: the highest ranks first (the
// newest among equals), as many as fit in LANE_LINES wrapped lines, shown
// oldest on top. A line too long for the lane is cut to its last line with
// an ellipsis, so the lane can never grow past its size.

export const LANE_LINES = 2;      // the lane's height in text lines
export const STREAM_CAP = 8;      // messages the stream holds at once (the lane shows 2 lines)

// Rank 2: the portal, a boss arriving, beaten or setting its rule, a quest or
// waypoint done, the maw. ("BOSS COMING: the pilot plays ..." and the clear
// sweep's pickup list are pilot and loot notes: rank 0.)
// The altar's boss call, a statue's curse deal (it names the boss reward) and
// the mid-boss kills are boss news too.
const RANK2 = /PORTAL|BOSS DOWN|BOSS RULE|APPROACHES|QUEST DONE|WAYPOINT DONE|THE MAW|RULEBREAKER| DONE: A JOKER|THE GATE OPENS|CALLS THE BOSS|^CURSE[: ]|^COLOSSUS DOWN|^HERALD DOWN/;
const RANK1 = /^WAVE \d|FINAL CALL|STAGE/;

export function toastRank(msg) {
  const s = String(msg || '').toUpperCase();
  if (s.startsWith('TIP')) return 0;      // a tip names a boss but is not news
  if (RANK2.test(s)) return 2;
  if (RANK1.test(s)) return 1;
  return 0;
}

// Push one entry into the stream (mutates `list`). Returns true when the new
// entry was kept.
export function pushToast(list, entry, cap = STREAM_CAP) {
  if (entry.rank === undefined) entry.rank = toastRank(entry.msg);
  list.push(entry);
  while (list.length > cap) {
    // The lowest rank goes, the oldest first among equals.
    let low = 0;
    for (let i = 1; i < list.length; i++) if ((list[i].rank || 0) < (list[low].rank || 0)) low = i;
    list.splice(low, 1);
  }
  return list.includes(entry);
}

// Pick the entries the lane paints. `wrap(msg)` returns the wrapped lines of
// one message. Returns [{ entry, lines }] in display order (oldest on top).
export function laneLines(list, wrap, maxLines = LANE_LINES) {
  const order = list.map((e, i) => ({ e, i }))
    .filter(o => (o.e.ttl || 0) > 0)
    .sort((a, b) => ((b.e.rank || 0) - (a.e.rank || 0)) || (b.i - a.i));
  const picked = [];
  let used = 0;
  for (const o of order) {
    if (used >= maxLines) break;
    let lines = wrap(o.e.msg);
    const room = maxLines - used;
    if (lines.length > room) {
      // A long line keeps the lane only if nothing else is shown yet: it is
      // cut to fit. Otherwise it waits for room.
      if (picked.length) continue;
      lines = lines.slice(0, room);
      lines[room - 1] = lines[room - 1].replace(/.?$/, '…');
    }
    picked.push({ entry: o.e, i: o.i, lines });
    used += lines.length;
  }
  picked.sort((a, b) => a.i - b.i);
  return picked.map(p => ({ entry: p.entry, lines: p.lines }));
}
