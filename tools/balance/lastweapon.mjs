// When does the build stop changing? The last weapon card (NEW or level) picked in a run,
// the drafts after it, and the stat cards taken after 5:00 (balance review 2026-11).
//   node tools/balance/lastweapon.mjs <file.jsonl...>   (records from tools/balance/batch.mjs)
import fs from 'node:fs';
const R = []; for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').trim().split('\n')) { const r = JSON.parse(l); if (r.bal) R.push(r); }
const q = (a, p) => { a = a.filter((x) => x != null).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, l = Math.floor(i), h = Math.ceil(i); return a[l] + (a[h] - a[l]) * (i - l); };
const mm = (s) => s == null ? '-' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const cells = [...new Set(R.map((r) => r.cell))];
console.log('| cell | last weapon card at m:ss | drafts after it | share of run after it | stat cards after 5:00 (top ids) |'); console.log('| --- | --- | --- | --- | --- |');
for (const c of cells) {
  const a = R.filter((r) => r.cell === c); const lw = [], after = [], share = []; const ids = {};
  for (const r of a) { const w = r.bal.draftLog.filter(([, id]) => /^(lvl|wpn)_/.test(id)); const t = w.length ? w[w.length - 1][0] : 0; lw.push(t); after.push(r.bal.draftLog.filter(([s]) => s > t).length); share.push(r.t ? (r.t - t) / r.t : 0);
    for (const [s, id] of r.bal.draftLog) if (s >= 300 && !/^(lvl|wpn|joker|shr)_/.test(id)) ids[id] = (ids[id] || 0) + 1; }
  const tot = Object.values(ids).reduce((x, y) => x + y, 0);
  console.log(`| ${c} | ${mm(q(lw, .5))} [${mm(q(lw, .1))}-${mm(q(lw, .9))}] | ${q(after, .5)} [${q(after, .1)}-${q(after, .9)}] | ${Math.round(100 * q(share, .5))}% | ${Object.entries(ids).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => k + ' ' + Math.round(100 * n / tot) + '%').join(', ')} |`);
}
