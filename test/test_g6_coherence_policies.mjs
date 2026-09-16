// test/test_g6_coherence_policies.mjs — G6 THE COHERENCE INSTRUMENT:
// unit/invariant proof for the coherent/scatter policy pair
// (tools/g6_coherence.mjs — the ONE shared table tools/w7b_draft_ab.mjs
// ships). Per docs/briefs/G6_COHERENCE_INSTRUMENT.md deliverable 2.
//
// The contract under test:
//   1. DETERMINISM: same seed + same policy -> byte-identical pick sequence.
//      Proven on a SYNTHETIC offer stream that mirrors the LIVE post-G26 pool
//      builder exactly where the code allows (openDraft's own weight sources:
//      weapon level-up cards at weight 1, stat cards at DRAFT_STAT_WEIGHT
//      luck-0, the RARE ladder at draftLadderWeight, the rewrite family via
//      the REAL rewriteCards(state) incl. its offering predicates and once-only
//      ledger) and openDraft's weighted-draw-without-replacement algorithm.
//      No real boot in the test: a bootReal cohort cannot fit the 60s cap
//      alongside the rest; the end-to-end wiring is proven by the two smoke
//      runs the brief keeps under /tmp/g6_instr/. DROPPED CHECK (60s cap):
//      no in-test real-Chrome coherence run; the fixture stands in for it.
//   2. THE POLICIES DIFFER IN COHERENCE, NOT TIER:
//      (a) STRUCTURAL — for every neutral offer (every stat + ladder card),
//          g6Rank('coherent') === g6Rank('scatter'): the tier block sits at
//          IDENTICAL absolute ranks in both arms, so the pair cannot diverge
//          on tier greed;
//      (b) EMPIRICAL — the two arms' tier-rank pick histograms OVERLAP on the
//          dominant neutral tiers;
//      (c) SEPARATION — on the declared COHERENCE METRIC (share of picks that
//          synergize with the committed family: class deepen|onfam), coherent
//          >> scatter, with the numbers printed.
//   3. The commitment rule is deterministic (first non-VOLLEY weapon in
//      state.weapons order — the pre-run LOADOUT's first brought weapon).
//
// Runs in well under 60s wall (pure computation; no DOM, no bootReal).

import { strict as assert } from 'node:assert';
import { mulberry32 } from '../src/weather.js';
import { UPGRADES, DRAFT_RARE_UPGRADES } from '../src/config.js';
import { DRAFT_STAT_WEIGHT, draftLadderWeight } from '../src/meta.js';
import { rewriteCards } from '../src/rewrites.js';
import {
  TIER_ORDER, tierOf, goodRank, g6Rank, committedWeapon, coherenceClass,
  pickCoherence, coherenceShare, WEAPON_TAG_LINK, offerTags,
} from '../tools/g6_coherence.mjs';

let pass = 0;
const ok = (m) => { pass++; console.log(`  ok ${m}`); };

const SEED = 20260916;
const DRAFTS = 400;          // fixture drafts per arm (declared)
const OFFER_N = 3;           // openDraft base offer count (fresh profile)

console.log('G6 coherence policies (coherent vs scatter): the instrument proof');

// ---- 0. the shared table reads the live registries --------------------------
{
  // The tier seam still resolves the post-G26 surface: lvl_* -> 'weapon',
  // rewrite_* -> 'family', stat cards -> their DRAFT_RARITY tier.
  assert.strictEqual(tierOf({ id: 'lvl_ORBIT_1' }, ''), 'weapon');
  assert.strictEqual(tierOf({ id: 'rewrite_rime' }, ''), 'family');
  assert.strictEqual(tierOf({ id: 'dmg' }, ''), 'stat:RARE');
  assert.strictEqual(tierOf({ tier: 'RARE', id: 'hp_pct' }, ''), 'rare');
  // The G21 tag taxonomy is read off REWRITES, never restated.
  assert.deepStrictEqual(offerTags({ id: 'rewrite_wideorbit' }), ['ORBIT']);
  assert.deepStrictEqual(offerTags({ id: 'rewrite_pierceall' }), []);
  assert.strictEqual(offerTags({ id: 'dmg' }), null);
  // The ONLY code-grounded weapon<->tag link (rewrites.js orbitEquipped).
  assert.deepStrictEqual(WEAPON_TAG_LINK, { ORBIT: ['ORBIT'] });
  ok('tier seam + tag taxonomy read from the live registries');
}

// ---- 1. the commitment rule is deterministic ---------------------------------
{
  assert.strictEqual(committedWeapon({ weapons: [{ type: 'VOLLEY' }, { type: 'BOOMERANG' }] }), 'BOOMERANG');
  assert.strictEqual(committedWeapon({ weapons: [{ type: 'VOLLEY' }, { type: 'ORBIT' }, { type: 'ZAP' }] }), 'ORBIT');
  assert.strictEqual(committedWeapon({ weapons: [{ type: 'VOLLEY' }] }), 'VOLLEY');
  assert.strictEqual(committedWeapon({}), 'VOLLEY');
  ok('committed = first non-VOLLEY in state.weapons order (loadout commitment)');
}

// ---- the fixture: a synthetic run mirroring the LIVE post-G26 pool -----------
// Kit: VOLLEY + ORBIT + ZAP (a 3-slot loadout; committed = ORBIT, the only
// weapon with a code-grounded G21 tag link). Weapon levels rise as their
// level-up cards are taken (ids regenerate exactly like openDraft's), and the
// rewrite family is drawn through the REAL rewriteCards(state) so predicates
// (WIDE ORBIT needs the ORBIT equipped; combos need both constituents) and
// the once-only ledger behave as shipped.
function simulatePolicy(policy, seed, drafts) {
  const rng = mulberry32(seed);
  const weapons = [{ type: 'VOLLEY', level: 1 }, { type: 'ORBIT', level: 1 }, { type: 'ZAP', level: 1 }];
  const state = { weapons, player: { rewrites: {} } };
  const picks = [];
  const pickTiers = [];
  const pickClasses = [];
  for (let d = 0; d < drafts; d++) {
    const committed = committedWeapon(state);
    const pool = [];
    for (const w of weapons) pool.push({ id: `lvl_${w.type}_${w.level}`, weight: 1 });
    for (const u of UPGRADES) pool.push({ id: u.id, name: u.name, weight: DRAFT_STAT_WEIGHT });
    for (const u of DRAFT_RARE_UPGRADES) {
      pool.push({ id: u.id, name: u.name, tier: 'RARE', weight: draftLadderWeight(u.id, 'RARE', 0) });
    }
    for (const c of rewriteCards(state)) pool.push({ ...c });
    // openDraft's weighted draw WITHOUT replacement, offer count 3.
    const choices = [];
    const p = [...pool];
    while (choices.length < OFFER_N && p.length > 0) {
      let r = rng() * p.reduce((s, c) => s + c.weight, 0);
      let idx = p.length - 1;
      for (let i = 0; i < p.length; i++) { if ((r -= p[i].weight) < 0) { idx = i; break; } }
      choices.push(p.splice(idx, 1)[0]);
    }
    const cards = choices.map(offer => ({ offer, html: '' }));
    const idx = pickCoherence(policy, cards, committed);
    const chosen = choices[idx];
    picks.push(chosen.id);
    pickTiers.push(tierOf(chosen, ''));
    pickClasses.push(coherenceClass(chosen, committed));
    // apply (the minimal state the next draft's ids/predicates read)
    const m = /^lvl_(.+)_\d+$/.exec(chosen.id);
    if (m) { const w = weapons.find(w => w.type === m[1]); if (w) w.level++; }
    else if (chosen.id.startsWith('rewrite_')) state.player.rewrites[chosen.id.slice(8)] = true;
  }
  return { picks, pickTiers, pickClasses, committed: committedWeapon(state) };
}

// ---- 2. DETERMINISM -----------------------------------------------------------
{
  for (const policy of ['coherent', 'scatter']) {
    const a = simulatePolicy(policy, SEED, DRAFTS);
    const b = simulatePolicy(policy, SEED, DRAFTS);
    console.log(`    ${policy}: ${DRAFTS} picks, rebuild equal=${JSON.stringify(a) === JSON.stringify(b)}`);
    assert.deepStrictEqual(a, b, `${policy} is not deterministic`);
  }
  const c1 = simulatePolicy('coherent', SEED, DRAFTS);
  const c2 = simulatePolicy('coherent', SEED + 1, DRAFTS);
  assert.notDeepStrictEqual(c1.picks, c2.picks, 'different seeds gave the same stream — fixture is not seeded');
  ok(`determinism: same seed -> identical pick sequence (${DRAFTS} drafts, both policies); seed actually moves the stream`);
}

// ---- 3. THE NOT-TIER-GREED PROOF ---------------------------------------------
{
  // (a) STRUCTURAL: every neutral offer ranks IDENTICALLY in both arms.
  const neutralIds = [
    ...UPGRADES.map(u => ({ id: u.id })),
    ...DRAFT_RARE_UPGRADES.map(u => ({ id: u.id, tier: 'RARE' })),
    ...DRAFT_RARE_UPGRADES.map(u => ({ id: u.id, tier: 'RARE' })),
  ];
  let checked = 0;
  for (const offer of neutralIds) {
    const tier = tierOf(offer, '');
    const rc = g6Rank('coherent', offer, tier, 'ORBIT');
    const rs = g6Rank('scatter', offer, tier, 'ORBIT');
    assert.strictEqual(rc, rs, `neutral offer ${offer.id} ranks differ (${rc} vs ${rs}) — tier greed leaked in`);
    checked++;
  }
  // ...and the coherence classes genuinely swap (the reverse claim).
  for (const [offer, cls] of [
    [{ id: 'lvl_ORBIT_1' }, 'deepen'], [{ id: 'lvl_ZAP_1' }, 'otherlvl'],
    [{ id: 'rewrite_wideorbit' }, 'onfam'], [{ id: 'rewrite_rime' }, 'offfam'],
  ]) {
    assert.notStrictEqual(
      g6Rank('coherent', offer, tierOf(offer, ''), 'ORBIT'),
      g6Rank('scatter', offer, tierOf(offer, ''), 'ORBIT'),
      `coherence class ${cls} does not swap between the arms`);
  }
  console.log(`    neutral offers rank-identical in both arms: ${checked}/${neutralIds.length} checked; all 4 coherence classes swap`);
  ok('structural: neutral block at IDENTICAL ranks in coherent/scatter; coherence classes swap');

  // (b) EMPIRICAL: the arms' tier-rank pick histograms overlap on the
  // dominant neutral tiers.
  const coh = simulatePolicy('coherent', SEED, DRAFTS);
  const sca = simulatePolicy('scatter', SEED, DRAFTS);
  const hist = (tiers) => tiers.reduce((h, t) => { h[t] = (h[t] || 0) + 1; return h; }, {});
  const hc = hist(coh.pickTiers), hs = hist(sca.pickTiers);
  const pct = (h) => {
    const tot = Object.values(h).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, `${v} (${(100 * v / tot).toFixed(1)}%)`]));
  };
  console.log(`    tier histogram coherent: ${JSON.stringify(pct(hc))}`);
  console.log(`    tier histogram scatter : ${JSON.stringify(pct(hs))}`);
  const shared = Object.keys(hc).filter(t => hs[t]);
  console.log(`    shared tiers: ${shared.join(', ')}`);
  assert.ok(shared.includes('stat:COMMON') && shared.includes('stat:UNCOMMON'),
    'the arms do not share the dominant stat tiers — they differ in tier, not only coherence');
  assert.ok(shared.length >= 4, `tier histograms overlap on only ${shared.length} tiers`);
  ok(`tier overlap: ${shared.length} tiers picked by BOTH arms incl. stat:COMMON + stat:UNCOMMON`);
}

// ---- 4. COHERENCE SEPARATION (the declared metric) ---------------------------
{
  const coh = simulatePolicy('coherent', SEED, DRAFTS);
  const sca = simulatePolicy('scatter', SEED, DRAFTS);
  assert.strictEqual(coh.committed, 'ORBIT');
  assert.strictEqual(sca.committed, 'ORBIT');
  const mc = coherenceShare(coh.picks.map(id => ({ id })), 'ORBIT');
  const ms = coherenceShare(sca.picks.map(id => ({ id })), 'ORBIT');
  console.log(`    COHERENCE METRIC (share of picks in the committed family): ` +
    `coherent ${(100 * mc).toFixed(1)}% vs scatter ${(100 * ms).toFixed(1)}% over ${DRAFTS} picks each`);
  // class histograms, printed as the causal account
  const ch = (xs) => xs.reduce((h, c) => { h[c] = (h[c] || 0) + 1; return h; }, {});
  console.log(`    pick classes coherent: ${JSON.stringify(ch(coh.pickClasses))}`);
  console.log(`    pick classes scatter : ${JSON.stringify(ch(sca.pickClasses))}`);
  assert.ok(mc > 0.15, `coherent's coherence share ${(100 * mc).toFixed(1)}% is not material`);
  assert.ok(ms < 0.05, `scatter's coherence share ${(100 * ms).toFixed(1)}% is not low`);
  assert.ok(mc > 3 * ms, `separation too weak: ${(100 * mc).toFixed(1)}% vs ${(100 * ms).toFixed(1)}%`);
  assert.notDeepStrictEqual(coh.picks, sca.picks, 'the two policies made identical picks — the axis is dead on this stream');
  ok(`separation: coherent ${(100 * mc).toFixed(1)}% >> scatter ${(100 * ms).toFixed(1)}% (>${3}x), pick streams differ`);
}

console.log(`TEST G6 COHERENCE POLICIES: ALL CHECKS PASSED (${pass})`);
