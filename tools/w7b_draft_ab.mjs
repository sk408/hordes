// HORDES — W7b paired-seed REAL-LOOP A/B (docs/briefs/W7B_DRAFT_DIVERGENCE.md:
// "The measurement gate"). The analytic sims are 2x off the real baseline and
// are NEVER used for this slice: this tool drives the true frame loop
// (tools/real_loop.mjs bootReal) with a pluggable DRAFT POLICY, the one
// variable the divergence measurement is about.
//
// THE DESIGN (brief): run the SAME seed twice — once with the good draft
// policy, once with the bad one — take the per-seed divergence ratio, then
// aggregate across seeds. Spawn variance cancels INSIDE each pair, so a
// powered read needs far fewer runs than the old bimodal n=8 cohorts.
// BEFORE (HEAD behaviour) vs AFTER (this slice) is the ladder kill switch:
//   --ladder off   boots the same tree with globalThis.HORDES_DRAFT_LADDER =
//                  false BEFORE src/main.js is imported (the module reads it
//                  once), which removes the ladder families + the chase rolls
//                  — the shipped HEAD pool.
//
// ARMS (one process per arm — cohorts in one process bleed profile state, and
// one bootReal per process is the harness contract):
//   node tools/w7b_draft_ab.mjs --ladder off --policy good --seed 4242 --runs 12 --cap 300
//   node tools/w7b_draft_ab.mjs --ladder off --policy bad  --seed 4242 --runs 12 --cap 300
//   node tools/w7b_draft_ab.mjs --ladder on  --policy good --seed 4242 --runs 12 --cap 300
//   node tools/w7b_draft_ab.mjs --ladder on  --policy bad  --seed 4242 --runs 12 --cap 300
//   node tools/w7b_draft_ab.mjs --aggregate good.jsonl bad.jsonl
//
// Pairing: run i in every arm seeds Math.random = mulberry32(seed + i) before
// startRun, so within a build the good and bad arms see the SAME spawn stream
// until their picks diverge the game state. The pick itself consumes no rng
// (index choice), so the streams stay aligned. KNOWN PAIRING LIMITATION: the
// LADDER-ON run still burns the chase-gate roll in src/main.js startRun()
// (CHASE_GATE_CHANCE), and that roll is drawn INSIDE the seeded stream, so the
// ladder-ON arms are paired to each other but the ladder-ON vs ladder-OFF
// comparison is not stream-identical at the gate. Moving that draw out of the
// rng stream is a separate, riskier change (it shifts every seeded test) and
// was deliberately NOT made here.
//
// ---------------------------------------------------------------------------
// THE POLICY (2026-09-15 RETARGET). The old rank table put `grant`=0,
// `lvlup`=1 and `family`=2 ABOVE `rare`=3, so the "good" arm only ever took a
// rare when no weapon and no rule card was offered: the recorded divergence
// measured a policy that never picked the rarity tier, i.e. it did not measure
// the ladder at all. This build makes `good` genuinely LADDER-FIRST.
//
// The order is DERIVED from the live pool, not hand-written: the tier of every
// offer is resolved from the registries the pool is actually BUILT from —
// UPGRADES + DRAFT_RARE_UPGRADES + DRAFT_MYTHIC_UPGRADES (src/config.js),
// DRAFT_RARITY (src/meta.js, the rarity CLASS of each flat stat card),
// RULE_IDS / SKILL_PERK_IDS / REWRITE_IDS / FROST_CARD_ID — plus the live
// offer's own `tier` badge written by main.js openDraft(). The offer OBJECT is
// read off the live card (`el._draftOffer`, set by openDraft) so the tool
// never restates the pool; a markup classifier remains as a fallback for the
// day that seam moves.
//
// SHIPPED ORDER (best -> worst for `good`):
//   0 mythic         MYTHIC ladder (Second Wind / Storm Shards / Full Hand)
//   1 rare           RARE ladder (Iron Heart +25% / Scholar's Stone /
//                    Gilded Palm / Crimson Edge)
//   2 stat:RARE      flat family, run-defining tier (Whetstone, Split Shot)
//   3 stat:UNCOMMON  flat family, solid value (Iron Heart, Sharpened Tips,
//                    Quick Hands)
//   4 stat:COMMON    flat family, utility (Light Boots, Gem Magnet)
//   5 weapon         NEW WEAPON grants + weapon level-up cards
//   6 family         RUN RULE / SKILL / REWRITE / Frost cards
//   7 unknown        anything the registries do not name
// `bad` is the EXACT REVERSE (rank = 7 - good rank), which is what makes it
// ladder-BLIND: the two ladder tiers land last, the persistent-condition
// family lands first. The asymmetry IS the measurement.
//
// The ladder ranks are unconditional (no early/late timing gate): a
// ladder-first policy takes the chase card whenever it is offered. The flat
// family's sub-order is read from DRAFT_RARITY (meta.js) rather than typed in,
// so growing the flat family cannot silently re-order it here.
//
// Output: one JSON line per run. The RUN line carries a `took` histogram
// ({cardId: count}) — WHAT THIS ARM ACTUALLY TOOK — plus `seen` (offered rows
// per tier, the "is this arm even seeing rares" evidence), `chase` (the run's
// chase gate result) and `rules` (the run-rule flags held). A SUMMARY line
// ends each arm; --aggregate pairs two JSONL files and prints the ratios and
// both arms' histograms.
import { bootReal, median, mean } from './real_loop.mjs';
import { mulberry32 } from '../src/weather.js';
import { readFileSync } from 'node:fs';
import { UPGRADES, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { DRAFT_RARITY } from '../src/meta.js';
import { RULE_IDS } from '../src/rules.js';
import { SKILL_PERK_IDS } from '../src/perks.js';
import { REWRITE_IDS } from '../src/rewrites.js';
import { FROST_CARD_ID } from '../src/frostcard.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

// ---------- THE TIER TABLE (derived from the live registries) ------------------
// TIER_ORDER is best -> worst for the good policy; a tier's INDEX is its good
// rank. Both policies read this ONE list, so they can never drift apart.
const TIER_ORDER = [
  'mythic',         // DRAFT_MYTHIC_UPGRADES (run-gated chase)
  'rare',           // DRAFT_RARE_UPGRADES (percent/scaling chase)
  'stat:RARE',      // flat family by DRAFT_RARITY (meta.js)
  'stat:UNCOMMON',
  'stat:COMMON',
  'weapon',         // NEW WEAPON grant + weapon level-up
  'family',         // RUN RULE / SKILL / REWRITE / Frost
  'unknown',
];
const TIER_COUNT = TIER_ORDER.length;              // 8 — `bad` = 7 - good

const ID_TIER = new Map();
for (const u of DRAFT_MYTHIC_UPGRADES) ID_TIER.set(u.id, 'mythic');
for (const u of DRAFT_RARE_UPGRADES) ID_TIER.set(u.id, 'rare');
for (const u of UPGRADES) ID_TIER.set(u.id, 'stat:' + (DRAFT_RARITY[u.id] || 'COMMON'));
for (const id of RULE_IDS) ID_TIER.set('rule_' + id, 'family');
for (const id of SKILL_PERK_IDS) ID_TIER.set('skill_' + id, 'family');
for (const id of REWRITE_IDS) ID_TIER.set('rewrite_' + id, 'family');
ID_TIER.set(FROST_CARD_ID, 'family');

// Markup fallback: classify off the LIVE rendered card markup only, exactly
// the way the offer is drawn by openDraft — badge first (so the RARE ladder's
// "Iron Heart" is never confused with the flat Iron Heart), then desc/name.
function htmlTier(html) {
  const s = html || '';
  if (s.includes('>MYTHIC</div>')) return 'mythic';
  if (s.includes('>RARE</div>')) return 'rare';
  if (s.includes('NEW WEAPON')) return 'weapon';
  if (s.includes(' UP</div>')) return 'weapon';              // "<weapon> UP" name
  if (s.includes('RUN RULE') || s.includes('SKILL -')) return 'family';
  for (const u of DRAFT_RARE_UPGRADES) if (s.includes(u.name + '</div>')) return 'rare';
  for (const u of DRAFT_MYTHIC_UPGRADES) if (s.includes(u.name + '</div>')) return 'mythic';
  for (const u of UPGRADES) if (s.includes(u.name + '</div>')) return ID_TIER.get(u.id);
  return 'unknown';
}

/** Tier of one live offer: the offer OBJECT first (its id + the tier badge
 *  openDraft wrote), the rendered markup as the fallback. */
function tierOf(offer, html) {
  if (offer) {
    if (offer.tier === 'MYTHIC') return 'mythic';
    if (offer.tier === 'RARE') return 'rare';
    if (offer.id) {
      const t = ID_TIER.get(offer.id);
      if (t) return t;
      if (offer.id.startsWith('wpn_') || offer.id.startsWith('lvl_')) return 'weapon';
    }
  }
  return htmlTier(html);
}

const goodRank = (tier) => {
  const i = TIER_ORDER.indexOf(tier);
  return i < 0 ? TIER_COUNT - 1 : i;
};
/** good chases the ladder; bad is the exact reverse — ladder cards LAST. */
const policyRank = (tier) => (policy === 'good' ? goodRank(tier) : TIER_COUNT - 1 - goodRank(tier));

const sumHist = (objs) => {
  const out = {};
  for (const o of objs) for (const [k, v] of Object.entries(o || {})) out[k] = (out[k] || 0) + v;
  return out;
};
const withPct = (h) => {
  const tot = Object.values(h).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, `${v} (${tot ? (100 * v / tot).toFixed(1) : '0.0'}%)`]));
};

// ---------- aggregate mode -----------------------------------------------------
if (args.aggregate) {
  const [goodFile, badFile] = process.argv.slice(3);
  const read = (f) => readFileSync(f, 'utf8').split('\n')
    .filter(l => l.startsWith('RUN ')).map(l => JSON.parse(l.slice(4)));
  const good = read(goodFile), bad = read(badFile);
  const n = Math.min(good.length, bad.length);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    if (good[i].seed !== bad[i].seed) throw new Error(`seed mismatch at run ${i}: ${good[i].seed} vs ${bad[i].seed} — the arms are not paired`);
    pairs.push({ seed: good[i].seed, good: good[i].time, bad: bad[i].time, ratio: good[i].time / Math.max(1, bad[i].time) });
  }
  const ratios = pairs.map(p => p.ratio);
  const gm = median(good.slice(0, n).map(r => r.time)), bm = median(bad.slice(0, n).map(r => r.time));
  console.log(`pairs: ${n}`);
  for (const p of pairs) console.log(`  seed ${p.seed}: good ${p.good.toFixed(1)}s vs bad ${p.bad.toFixed(1)}s -> x${p.ratio.toFixed(3)}`);
  console.log(`median survival: good ${gm.toFixed(1)}s vs bad ${bm.toFixed(1)}s`);
  console.log(`mean survival:   good ${mean(good.slice(0, n).map(r => r.time)).toFixed(1)}s vs bad ${mean(bad.slice(0, n).map(r => r.time)).toFixed(1)}s`);
  console.log(`DIVERGENCE median-of-ratios: x${median(ratios).toFixed(3)}   ratio-of-medians: x${(gm / Math.max(1, bm)).toFixed(3)}   mean ratio: x${mean(ratios).toFixed(3)}`);
  // WHAT EACH ARM ACTUALLY TOOK — the causal account, joined into one
  // cardId -> good/bad count table so a "did the good arm even take rares"
  // read is a glance rather than a cross-reference.
  const gt = sumHist(good.slice(0, n).map(r => r.took)), bt = sumHist(bad.slice(0, n).map(r => r.took));
  const gs = sumHist(good.slice(0, n).map(r => r.seen)), bs = sumHist(bad.slice(0, n).map(r => r.seen));
  const tierOfId = (id) => ID_TIER.get(id)
    || (id.startsWith('wpn_') || id.startsWith('lvl_') ? 'weapon' : 'unknown');
  const byTier = (h) => { const o = {}; for (const [k, v] of Object.entries(h)) { const t = tierOfId(k); o[t] = (o[t] || 0) + v; } return o; };
  console.log(`TOOK good: ${JSON.stringify(withPct(gt))}`);
  console.log(`TOOK bad:  ${JSON.stringify(withPct(bt))}`);
  console.log(`TOOK-by-tier good: ${JSON.stringify(withPct(byTier(gt)))}`);
  console.log(`TOOK-by-tier bad:  ${JSON.stringify(withPct(byTier(bt)))}`);
  console.log(`SEEN (offer rows, by tier) good: ${JSON.stringify(withPct(gs))}`);
  console.log(`SEEN (offer rows, by tier) bad:  ${JSON.stringify(withPct(bs))}`);
  const chaseGood = good.slice(0, n).filter(r => (r.chase || []).length).length;
  const chaseBad = bad.slice(0, n).filter(r => (r.chase || []).length).length;
  console.log(`chase gate fired: good ${chaseGood}/${n} runs vs bad ${chaseBad}/${n} runs`);
  process.exit(0);
}

// ---------- run mode -----------------------------------------------------------
const ladder = (args.ladder || 'on') !== 'off';
const policy = args.policy || 'good';
const seed0 = Number(args.seed || 4242);
const runs = Number(args.runs || 24);
const cap = Number(args.cap || 0);           // seconds of sim per run; 0 = RUN.LIMIT + 60
const stage = args.stage || 'maxed';

if (!ladder) globalThis.HORDES_DRAFT_LADDER = false;   // BEFORE arm: the HEAD pool

// State the shipped order OUT LOUD in the output, so a reader never has to
// take the transcript's word for what the arm was chasing.
console.log(`ORDER policy=${policy} ` + TIER_ORDER
  .map((t, i) => `${t}=${policyRank(t)}`).sort().join(' '));
console.log(`POOL-DERIVED tiers: mythic=${DRAFT_MYTHIC_UPGRADES.map(u => u.id).join(',')} ` +
  `rare=${DRAFT_RARE_UPGRADES.map(u => u.id).join(',')} ` +
  `stat:${UPGRADES.map(u => u.id + '/' + (DRAFT_RARITY[u.id] || 'COMMON')).join(' ')} ` +
  `family=${['rule_' + RULE_IDS[0], RULE_IDS.length + ' rules', SKILL_PERK_IDS.length + ' skills', REWRITE_IDS.length + ' rewrites', FROST_CARD_ID].join(' ')}`);

const h = await bootReal(stage);
const st = h.state;
const dtMs = 1000 / 60;
const capFrames = Math.floor((cap || (1860 + 60)) * 60);
const real = Math.random;
const out = [];
try {
  for (let i = 1; i <= runs; i++) {
    const seed = seed0 + i;
    Math.random = mulberry32(seed);
    h.startRun();
    const took = {};            // cardId -> count (WHAT this arm took)
    const seen = {};            // tier   -> count (offer rows shown to this arm)
    let t = 0;
    for (let f = 0; f < capFrames; f++) {
      h.dom.advance(dtMs);
      const cb = h.dom.rafQueue.shift();
      if (!cb) throw new Error('real_loop: raf queue died');
      cb(performance.now());
      t = st.time;
      if (st.mode === 'dead') break;
      const ov = h.dom.elements['overlay'];
      const cards = h.dom.elements['ov-cards'] ? h.dom.elements['ov-cards'].children : [];
      const key = h.dom.keyHandler();
      if (ov && ov.style.display === 'flex' && cards.length > 0 && key) {
        if (st.mode === 'draft') {
          // THE POLICY: pick the best-ranked card. The tier comes off the live
          // offer (its id + the badge openDraft wrote), never a restated pool.
          let best = 0, bestRank = Infinity, bestTier = 'unknown';
          for (let c = 0; c < cards.length; c++) {
            const offer = cards[c]._draftOffer;
            const tier = tierOf(offer, cards[c].innerHTML || '');
            seen[tier] = (seen[tier] || 0) + 1;         // offered rows, per tier
            const r = policyRank(tier);
            if (r < bestRank) { bestRank = r; best = c; bestTier = tier; }
          }
          const chosen = cards[best]._draftOffer;
          const id = (chosen && chosen.id) || ('#' + (best + 1) + ':' + bestTier);
          took[id] = (took[id] || 0) + 1;
          key({ key: String(best + 1) });
        } else if (st.mode === 'evolve') {
          key({ key: '1' });
        } else {
          const titled = (t2) => cards.find(c => (c.innerHTML || '').includes(t2));
          const cont = titled('CONTINUE');
          if (cont) cont.click();
          else { const play = titled('PLAY'); if (play) play.click(); else key({ key: '1' }); }
        }
      }
      // Skill policy (real_loop precedent): press Q/E while a boss is up.
      if (key && (st.mode === 'playing' || st.mode === 'finale')) {
        const bossUp = (st.wave.bosses || []).some(b => b && b.hp > 0)
          || (st.wave.midBosses || []).some(b => b && b.hp > 0)
          || !!(st.finalBoss && st.finalBoss.hp > 0);
        if (bossUp) { key({ key: 'q' }); key({ key: 'e' }); }
      }
    }
    const rec = {
      i, seed, time: Math.floor(t * 10) / 10, won: !!st.runWon, level: st.player.level, kills: st.player.kills,
      took,                                                     // {cardId: count} — what this run took
      seen,                                                     // {tier: count} — what it was OFFERED
      chase: Object.keys(st.chasePool || {}),                   // the run's chase-gate result (ladder on)
      rules: Object.keys(st.player.rules || {}),                // run-rule flags held
    };
    out.push(rec);
    console.log('RUN ' + JSON.stringify(rec));
  }
} finally { Math.random = real; }
const times = out.map(r => r.time);
console.log(`SUMMARY ladder=${ladder ? 'on' : 'off'} policy=${policy} stage=${stage} runs=${runs} ` +
  `median=${median(times).toFixed(1)}s mean=${mean(times).toFixed(1)}s won=${out.filter(r => r.won).length} ` +
  `censored=${out.filter(r => r.time >= cap && !r.won).length}/${runs}`);
console.log(`TOOK-ALL ${JSON.stringify(withPct(sumHist(out.map(r => r.took))))}`);
console.log(`SEEN-ALL ${JSON.stringify(withPct(sumHist(out.map(r => r.seen))))}`);
