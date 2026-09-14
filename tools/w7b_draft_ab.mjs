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
//   node tools/w7b_draft_ab.mjs --ladder off --policy good --seed 4242 --runs 24
//   node tools/w7b_draft_ab.mjs --ladder off --policy bad  --seed 4242 --runs 24
//   node tools/w7b_draft_ab.mjs --ladder on  --policy good --seed 4242 --runs 24
//   node tools/w7b_draft_ab.mjs --ladder on  --policy bad  --seed 4242 --runs 24
//   node tools/w7b_draft_ab.mjs --aggregate good.jsonl bad.jsonl
//
// Pairing: run i in every arm seeds Math.random = mulberry32(seed + i) before
// startRun, so within a build the good and bad arms see the SAME spawn stream
// until their picks diverge the game state. The pick itself consumes no rng
// (index choice), so the streams stay aligned.
//
// THE POLICIES (deliberately simple, deterministic, stated): the draft cards
// are classified off the LIVE rendered card markup — never a restated pool —
// and ranked. good takes the best rank, bad the exact reverse order:
//   MYTHIC chase > RARE percent > weapon level-up > Whetstone/Split Shot >
//   NEW WEAPON grant > defensive commons (Iron Heart/Quick Hands/Sharpened
//   Tips, rewrites, Pocket Frost) > RUN RULE/SKILL family > Light Boots/Gem
//   Magnet. The asymmetry IS the measurement: a policy that values the ladder
//   vs one that values utility filler.
//
// Output: one JSON line per run (RUN {...}) + a SUMMARY line. --aggregate reads
// two JSONL files (good, bad), pairs by run index, and reports the per-seed
// ratios, their median, and the ratio of medians.
import { bootReal, median, mean } from './real_loop.mjs';
import { mulberry32 } from '../src/weather.js';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

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
  console.log(`pairs: ${n}`);
  for (const p of pairs) console.log(`  seed ${p.seed}: good ${p.good.toFixed(1)}s vs bad ${p.bad.toFixed(1)}s -> x${p.ratio.toFixed(3)}`);
  console.log(`median survival: good ${median(good.slice(0, n).map(r => r.time)).toFixed(1)}s vs bad ${median(bad.slice(0, n).map(r => r.time)).toFixed(1)}s`);
  console.log(`DIVERGENCE median-of-ratios: x${median(ratios).toFixed(3)}   ratio-of-medians: x${(median(good.slice(0, n).map(r => r.time)) / Math.max(1, median(bad.slice(0, n).map(r => r.time)))).toFixed(3)}   mean ratio: x${mean(ratios).toFixed(3)}`);
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

// THE POLICIES (deliberately simple, deterministic, stated — fixed a priori,
// not tuned to the outcome): the draft cards are classified off the LIVE
// rendered card markup — never a restated pool — and ranked by what the card
// is worth WHEN OFFERED (the brief's own timing gates: Scholar/Gilded/Full
// Hand compound early and are dead late). good takes the best rank, bad the
// exact reverse order, so the asymmetry IS the measurement: value the ladder
// and the weapon economy for what they pay, vs invert those values.
function classify(html) {
  if (html.includes('Second Wind')) return 'second_wind';
  if (html.includes('Storm Shards')) return 'storm_shards';
  if (html.includes('Full Hand')) return 'full_hand';
  if (html.includes("Scholar's Stone")) return 'xp_pct';
  if (html.includes('Gilded Palm')) return 'gold_pct';
  if (html.includes('>RARE<')) return 'rare';          // Iron Heart +25% / Crimson Edge
  if (html.includes('NEW WEAPON')) return 'grant';
  if (html.includes(' UP</div>')) return 'lvlup';
  if (html.includes('Whetstone') || html.includes('Split Shot')) return 'dmg';
  if (html.includes('RUN RULE') || html.includes('SKILL -')) return 'family';
  if (html.includes('Light Boots') || html.includes('Gem Magnet')) return 'util';
  return 'common';                                     // flat Iron Heart / Quick Hands / Sharpened Tips / rewrites / Pocket Frost
}
// Rank (lower = better for the good policy; bad takes 9 - rank).
// MEASURED PRIOR (2026-09-14, this tree): the house cohort policy (prefer NEW
// WEAPON, else card 1) survives capped runs where lvlup/dmg-first and
// util-first both die ~160-230s — the weapon COUNT axis dominates every
// second-order preference, so grants rank first for good and last for bad.
// After that: a spare life, weapon levels, the perk/rule family, and the
// brief's own timing gates (Scholar/Gilded/Full Hand compound early, dead
// late). Both policies are stated here and frozen before the measurement.
function rank(html, t) {
  const early = t < 300;
  switch (classify(html)) {
    case 'grant': return 0;
    case 'second_wind': return 1;
    case 'lvlup': return 1;
    case 'family': case 'storm_shards': return 2;
    case 'full_hand': return early ? 2 : 8;
    case 'xp_pct': return early ? 2 : 6;
    case 'dmg': case 'common': case 'rare': return 3;
    case 'gold_pct': return early ? 4 : 7;
    case 'util': default: return 5;
  }
}
const cardRank = (html, t) => {
  const r = rank(html, t);
  return policy === 'good' ? r : 9 - r;
};

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
          // THE POLICY: pick the best-ranked card off the LIVE markup.
          let best = 0, bestRank = Infinity;
          for (let c = 0; c < cards.length; c++) {
            const r = cardRank(cards[c].innerHTML || '', st.time);
            if (r < bestRank) { bestRank = r; best = c; }
          }
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
    const rec = { i, seed, time: Math.floor(t * 10) / 10, won: !!st.runWon, level: st.player.level, kills: st.player.kills };
    out.push(rec);
    console.log('RUN ' + JSON.stringify(rec));
  }
} finally { Math.random = real; }
const times = out.map(r => r.time);
console.log(`SUMMARY ladder=${ladder ? 'on' : 'off'} policy=${policy} stage=${stage} runs=${runs} ` +
  `median=${median(times).toFixed(1)}s mean=${mean(times).toFixed(1)}s won=${out.filter(r => r.won).length}`);
