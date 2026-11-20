// CAREER MODEL (balance review 2026-11): the real shop policies (tools/progression/policies.mjs, real
// META.buyUpgrade on a real makeProfile()) spending a MEASURED income curve:
// gold, survival, drafts and wave per run as a function of the gold the build
// has had spent on it, interpolated (log budget) from fixed-build medians of
// the same (shop, draft) cell. Trophy grants are applied from the run's
// survival / wave / running totals. The escape payout is added (bestGold/15,
// x3 with the Escape Writ) whenever the run reached wave 2.
//   node tools/balance/careermodel.mjs <draft> <file.jsonl...>   prints milestones for each shop policy
// The records are --fixed-build runs (tools/balance/batch.mjs) at several budgets of
// one draft policy; SHOPS=buy-next,cheapest picks the shop policies (the review also
// used 'wc-first', a scratch policy that is not kept). Checked against 18 real
// 12-run careers to about 20% in hours (balance review 2026-11); run counts are looser.
// The trophy list below is a copy of src/achievements.js as of 2026-11: keep it in step.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const WT = process.env.BAL_TREE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.HORDES_TREE = WT;
const { loadCatalogue } = await import(pathToFileURL(WT + '/tools/progression/catalogue.mjs').href);
const { makeShopper, buyAll, estimateIncome } = await import(pathToFileURL(WT + '/tools/progression/policies.mjs').href);
const cat = await loadCatalogue();
const M = cat.META;
const [draft, ...files] = process.argv.slice(2);
const DRAFT_S = Number(process.env.DRAFT_S || 2), MENU_S = Number(process.env.MENU_S || 20);
const recs = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.kind === 'fixed' && !(r.prestige > 0));
const med = (a) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; };
function curve(shop) {
  const by = new Map();
  for (const r of recs) { const [s, , d] = r.policy.split('/'); if (d !== draft) continue; if (s !== shop && !(r.budget >= 500000)) continue; (by.get(r.budget) || by.set(r.budget, []).get(r.budget)).push(r); }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([b, rs]) => ({ b, gold: med(rs.map((r) => r.gold)), t: med(rs.map((r) => r.t)), drafts: med(rs.map((r) => r.drafts)), wave: med(rs.map((r) => r.wave)), chests: med(rs.map((r) => r.chests || 0)), kills: med(rs.map((r) => r.kills)) }));
}
function at(cv, B) {
  const x = Math.log(1 + B);
  if (B <= cv[0].b) return cv[0];
  for (let i = 1; i < cv.length; i++) {
    if (B <= cv[i].b) { const a = cv[i - 1], c = cv[i]; const f = (x - Math.log(1 + a.b)) / (Math.log(1 + c.b) - Math.log(1 + a.b)); const o = {}; for (const k of Object.keys(c)) o[k] = a[k] + (c[k] - a[k]) * f; return o; }
  }
  return cv[cv.length - 1];
}
const TROPHY = [
  ['weapon_orbit', (s) => s.bossKills >= 1], ['weapon_zap', (s) => s.bossKills >= 5], ['weapon_nova_pulse', (s) => s.bestWave >= 5],
  ['weapon_scythe', (s) => s.bestWave >= 10], ['weapon_seeker', (s) => s.bestWave >= 20], ['weapon_mine', (s) => s.bestT >= 600],
  ['char:WITCH', (s) => s.bestT >= 1200], ['char:ROGUE', (s) => s.gold >= 10000], ['char:PALADIN', (s) => s.chests >= 25],
];
const RUNS = Number(process.env.RUNS || 3000);
for (const shop of (process.env.SHOPS || 'buy-next,cheapest').split(',')) {
  const cv = curve(shop);
  if (!cv.length) continue;
  const prof = M.makeProfile();
  const sh = makeShopper(shop, cat, {});
  const st = { bossKills: 0, bestWave: 0, bestT: 0, gold: 0, chests: 0, bestGold: 0 };
  const income = []; let hours = 0, spent = 0; const ms = []; const seen = new Set();
  const mark = (name, run) => { if (!seen.has(name)) { seen.add(name); ms.push({ name, run, h: +hours.toFixed(1), spent }); } };
  let flat = 0, maxFlat = 0, flatStart = 0, maxFlatAt = 0;
  for (let run = 1; run <= RUNS; run++) {
    const r = at(cv, spent);
    let gold = r.gold;
    if (r.wave >= 2) gold += Math.floor(st.bestGold / 15) * ((prof.purchased.escapeskip | 0) ? 3 : 1);
    if (run === 1) gold += 250;
    hours += (r.t + r.drafts * DRAFT_S + MENU_S) / 3600;
    st.gold += gold; st.bestGold = Math.max(st.bestGold, r.gold); st.bestWave = Math.max(st.bestWave, Math.floor(r.wave)); st.bestT = Math.max(st.bestT, r.t);
    if (r.wave >= 2) st.bossKills += Math.floor(r.wave - 1); st.chests += r.chests;
    for (const [id, ok] of TROPHY) if (ok(st)) {
      if (id.startsWith('char:')) { const c = id.slice(5); if (!prof.unlockedCharacters.includes(c)) { prof.unlockedCharacters.push(c); mark('trophy ' + id, run); } }
      else if (!M.shopRowOwned(prof, M.SHOP_BY_ID[id])) { M.grantShopRow(prof, id); mark('trophy ' + id, run); }
    }
    prof.gold += gold; income.push(gold);
    const bought = buyAll(prof, sh, estimateIncome(income, 70), cat);
    for (const b of bought) {
      spent += b.cost;
      if (!seen.has('first purchase')) mark('first purchase', run);
      if (b.id.startsWith('weapon_') || b.id.startsWith('char:')) mark('bought ' + b.id, run);
      const d = M.SHOP_BY_ID[b.id]; if (d && !d.kind && (prof.purchased[b.id] | 0) >= d.maxLevel) mark('first row maxed (' + b.id + ')', run), seen.add('first row maxed'), mark('first row maxed', run);
    }
    if (bought.length) { flat = 0; } else { if (flat === 0) flatStart = run; flat++; if (flat > maxFlat) { maxFlat = flat; maxFlatAt = flatStart; } }
    const rem = cat.remaining(prof); const pct = 100 * (1 - rem.cost / cat.totalCost);
    if (pct >= 25) mark('shop 25% (by gold)', run); if (pct >= 50) mark('shop 50% (by gold)', run); if (pct >= 99.999) { mark('shop 100%', run); break; }
    if (r.t >= 1799) mark('first 30:00 run (model)', run);
  }
  const income1h = ms;
  console.log(`\n== ${shop} / ${draft}  (curve points: ${cv.map((p) => p.b).join(',')}; draft pick ${DRAFT_S}s, menu ${MENU_S}s per run)`);
  console.log(`longest run without a purchase: ${maxFlat} runs from run ${maxFlatAt}`);
  for (const m of income1h.filter((m) => !m.name.startsWith('first row maxed ('))) console.log(`  run ${String(m.run).padStart(4)}  ${String(m.h).padStart(6)} h  spent ${String(m.spent).padStart(7)}  ${m.name}`);
}
