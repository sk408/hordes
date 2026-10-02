// HORDES — test/test_dev_draft_ban.mjs: K5 DEV DRAFT BAN LIST (dev-autoplay
// cohort tool).
//
// The owner report: autoplay "keeps taking" ONE OF EACH, which harms long-run
// testing. The ban list is the TESTING TOOL, not a verdict: ONE OF EACH stays
// fully live for players; the toggle only excludes banned ids from the OFFER
// POOL during dev-autoplay runs so with/without cohorts become possible.
//
// What is pinned here (at the REAL seams, never copies):
//   1. parseDraftBanIds: absent pref = the default preset; a stored string is
//      authoritative; the preset's 'joker_once' is ONE OF EACH's real offer id
//      (src/jokers.js jokerCards builds 'joker_' + 'once').
//   2. The toggle defaults OFF and the ids pref defaults absent.
//   3. BYTE-IDENTICAL POOL WHEN OFF: a gate-off boot, a dev boot with the ban
//      prefs set but AUTOPLAY off, and a dev boot with AUTOPLAY on but the BAN
//      toggle off produce the EXACT same offered-id sequences under the same
//      seeded rng (deep-equal, per draft).
//   4. ON + preset: 'joker_once' never appears in the offered sets across N
//      seeded drafts (read off the dev session's drafts ledger), while the
//      same-seed control with the ban off DOES offer it.
//   5. ARBITRARY ID: banning 'multi' (Split Shot) removes exactly that card.
//   6. SNAPSHOT: an armed autoplay run stamps draft_ban (additive optional,
//      schema_v 2 unchanged); unarmed runs carry no key.
//   7. The overlay BAN button arms/disarms through the REAL pref path.
//
// Run: node test/test_dev_draft_ban.mjs
import assert from 'node:assert/strict';
import { boot } from './_harness.mjs';
import { makeWeapon } from '../src/weapons.js';
import { jokerCards } from '../src/jokers.js';
import {
  DEV_LS_AUTO, DEV_LS_BAN_ON, DEV_LS_BAN_IDS,
  DEFAULT_DRAFT_BAN_IDS, parseDraftBanIds, requireAutoplay,
} from '../src/dev_autoplay.js';
import { buildSnapshot, validateSnapshot } from '../src/dev_telemetry.js';

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const seeded = (seed) => { let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

console.log('dev draft ban list (K5): prefs, gating, pool exclusion, snapshot');

// ---- 1. the pure parse + the preset names ONE OF EACH's REAL offer id ------
ok('parseDraftBanIds: absent = default preset, stored string authoritative', () => {
  assert.deepEqual(parseDraftBanIds(null), DEFAULT_DRAFT_BAN_IDS);
  assert.deepEqual(parseDraftBanIds(undefined), DEFAULT_DRAFT_BAN_IDS);
  assert.deepEqual(parseDraftBanIds(''), [], 'an empty stored list bans nothing');
  assert.deepEqual(parseDraftBanIds('multi, joker_once ,multi,,'), ['joker_once', 'multi'],
    'trimmed, deduped, sorted');
});
ok("the default preset is exactly ONE OF EACH's offer id (joker_once)", () => {
  assert.deepEqual(DEFAULT_DRAFT_BAN_IDS, ['joker_once']);
  const cards = jokerCards({ player: { rules: {}, jokers: [], stats: {} } });
  assert.ok(cards.some(c => c.id === 'joker_once' && c.joker === 'once'),
    "jokerCards really offers 'joker_once' for the ONE OF EACH joker");
});

// ---- 2. toggle defaults OFF --------------------------------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'banDefault' });
  h.T.startRun();
  const sess = h.T.dev.session;
  ok('BAN toggle defaults OFF, ids default to the preset, nothing persisted', () => {
    assert.equal(sess.draftBan, false, 'draftBan defaults OFF');
    assert.deepEqual(sess.draftBanIds, ['joker_once'], 'absent ids pref = the preset');
    assert.equal(h.storage.get(DEV_LS_BAN_ON) ?? null, null, 'no arm bit stored');
    assert.equal(h.storage.get(DEV_LS_BAN_IDS) ?? null, null, 'no ids pref stored');
    assert.equal(h.T.dev.draftBan, false, 'the seam reads OFF');
  });
}

// ---- 3./6. byte-identical pool when the gate OR the toggle is off -----------
// Three boots, same run state, same seeded rng, N drafts each. Boot A: dev
// gate OFF (the player game). Boot B: dev gate on, ban prefs SET (arm + ids),
// but AUTOPLAY off — a non-autoplay context must still draw the full pool.
// Boot C: dev gate on, AUTOPLAY on, BAN toggle OFF.
const DRAFT_N = 300;
const DRAFT_SEED = 424242;
function draftSequences(h) {
  const st = h.T.state;
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  st.player.rules = {}; st.player.takenStats = {};
  st.chasePool = {};                      // ladder roll neutralized: same pool every boot
  const real = Math.random;
  Math.random = seeded(DRAFT_SEED);
  const seq = [];
  try {
    for (let i = 0; i < DRAFT_N; i++) {
      h.T.openDraft();
      seq.push(Array.from(h.elements['ov-cards'].children).map(el => el._draftOffer.id));
    }
  } finally { Math.random = real; }
  assert.equal(seq.length, DRAFT_N);
  assert.ok(seq.every(s => s.length === 3), 'every draft offered exactly 3 cards');
  return seq;
}
{
  const a = await boot({ variant: 'banGateOff' });
  a.T.startRun();
  const seqA = draftSequences(a);

  const b = await boot({ locationSearch: '?dev=1', variant: 'banNoAutoplay',
    storage: [[DEV_LS_BAN_ON, '1'], [DEV_LS_BAN_IDS, 'joker_once,multi']] });
  b.T.startRun();
  assert.equal(b.T.dev.session.draftBan, true, 'boot B armed the ban bit');
  assert.equal(b.T.dev.session.autoplay, false, 'boot B is NOT an autoplay context');
  const seqB = draftSequences(b);

  const c = await boot({ locationSearch: '?dev=1', variant: 'banToggleOff',
    storage: [[DEV_LS_AUTO, '1'], [DEV_LS_BAN_IDS, 'joker_once,multi']] });
  c.T.startRun();
  assert.equal(c.T.dev.session.autoplay, true, 'boot C is an autoplay context');
  assert.equal(c.T.dev.session.draftBan, false, 'boot C left the ban toggle OFF');
  const seqC = draftSequences(c);

  ok('gate OFF = byte-identical offered sequences (ban prefs set, autoplay off)', () => {
    assert.deepEqual(seqB, seqA, 'a non-autoplay context with the pref on draws the full pool');
  });
  ok('toggle OFF = byte-identical offered sequences (autoplay on)', () => {
    assert.deepEqual(seqC, seqA, 'autoplay without the BAN arm bit draws the full pool');
  });
  ok('the pinned sequence still offers the bannable ids (controls live)', () => {
    assert.ok(seqA.some(s => s.includes('joker_once')), 'joker_once offered in the control');
    assert.ok(seqA.some(s => s.includes('multi')), 'multi offered in the control');
  });
}

// ---- 4. ON + preset: ONE OF EACH never offered ------------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'banOn',
    storage: [[DEV_LS_AUTO, '1'], [DEV_LS_BAN_ON, '1']] });   // ids pref ABSENT = preset
  h.T.startRun();
  const sess = h.T.dev.session;
  requireAutoplay(sess);   // the runner gate accepts this session
  assert.equal(sess.draftBan, true);
  assert.deepEqual(sess.draftBanIds, ['joker_once'], 'the preset rides the session');

  const st = h.T.state;
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  st.chasePool = {};
  const runDrafts = (seed, n) => {
    st.player.rules = {}; st.player.takenStats = {};
    const offset = sess.drafts.length;
    const real = Math.random;
    Math.random = seeded(seed);
    try { for (let i = 0; i < n; i++) h.T.openDraft(); }
    finally { Math.random = real; }
    return sess.drafts.slice(offset).map(d => d.offered);
  };

  const banned = runDrafts(777, 600);
  ok('ON + preset: joker_once is in NO offered set across 600 seeded drafts', () => {
    assert.equal(banned.length, 600, 'the drafts ledger recorded every offer set');
    assert.ok(banned.every(ids => !ids.includes('joker_once')),
      'ONE OF EACH excluded from the offer pool');
    assert.ok(banned.flat().length > 0, 'drafts still offered cards');
  });
  h.T.dev.setDraftBan(false);
  const control = runDrafts(777, 600);
  ok('same seed, ban off: joker_once IS offered (the card itself is untouched)', () => {
    assert.ok(control.some(ids => ids.includes('joker_once')),
      'the control proves the card is still in the pool');
  });
}

// ---- 5. arbitrary-id ban ------------------------------------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'banArbitrary' });
  h.T.startRun();
  h.T.dev.setAutoplay(true);
  h.T.dev.setDraftBan(true);
  assert.deepEqual(h.T.dev.setDraftBanIds(['multi']), ['multi'],
    'the seam persists + re-reads the id list');
  assert.equal(h.storage.get(DEV_LS_BAN_IDS), 'multi', 'the ids pref persisted');

  const st = h.T.state;
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  st.chasePool = {};
  const real = Math.random;
  Math.random = seeded(555);
  const offered = [];
  try {
    for (let i = 0; i < 600; i++) {
      h.T.openDraft();
      offered.push(...Array.from(h.elements['ov-cards'].children).map(el => el._draftOffer.id));
    }
  } finally { Math.random = real; }
  ok("an arbitrary id ('multi') never appears while banned", () => {
    assert.ok(!offered.includes('multi'), 'Split Shot excluded');
    assert.ok(offered.includes('joker_once'), 'unbanned ids still offered (joker_once present)');
  });
}

// ---- 6b. snapshot stamp (additive optional, schema_v 2 unchanged) ------------
ok('buildSnapshot carries draft_ban when armed, omits it when not, validates both', () => {
  const base = {
    schema_v: 2, game_rev: 'abc123:dirty', seed: 7,
    upgrades: { purchased: {} }, shrines: { used: 0, blessings: [] },
    items: [], gold_earned: 100, gold_spent: 10, damage: 5, wave: 1,
    test: false, speed: 8,
  };
  const armed = buildSnapshot({ ...base, draft_ban: ['joker_once'] });
  assert.deepEqual(armed.draft_ban, ['joker_once'], 'banned ids ride the snapshot');
  assert.equal(armed.schema_v, 2, 'no schema bump');
  assert.equal(validateSnapshot(armed).ok, true, 'armed row validates');
  const unarmed = buildSnapshot({ ...base });
  assert.ok(!('draft_ban' in unarmed), 'unarmed runs carry no key (byte-identical history)');
  assert.equal(validateSnapshot(unarmed).ok, true, 'unarmed row still validates');
  assert.throws(() => buildSnapshot({ ...base, draft_ban: [''] }), /bad draft_ban/,
    'empty ids refused at build');
  assert.throws(() => buildSnapshot({ ...base, draft_ban: 'joker_once' }), /bad draft_ban/,
    'a non-array refused at build');
});
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'banSnap' });
  h.T.dev.setAutoplay(true);
  h.T.dev.setDraftBan(true);
  h.T.startRun();
  h.T.dev.setAutoplay(true);
  h.T.dev.setDraftBan(true);
  const snap = h.T.dev.rebuildSnapshot();
  ok('the LIVE snapshot builder stamps the banned ids for an armed autoplay run', () => {
    assert.deepEqual(snap.draft_ban, ['joker_once'], 'the preset is on the row');
    assert.equal(validateSnapshot(snap).ok, true, 'the row validates');
  });
  h.T.dev.setDraftBan(false);
  const snapOff = h.T.dev.rebuildSnapshot();
  ok('ban off (or autoplay off) leaves the snapshot without draft_ban', () => {
    assert.ok(!('draft_ban' in snapOff), 'unarmed: no key');
    h.T.dev.setDraftBan(true);
    h.T.dev.setAutoplay(false);
    const snapNoAuto = h.T.dev.rebuildSnapshot();
    assert.ok(!('draft_ban' in snapNoAuto), 'armed but not autoplay: no key');
  });
}

// ---- 7. the overlay BAN button drives the REAL pref path ----------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'banBtn' });
  h.T.startRun();
  const panel = (globalThis.document.body.children || [])
    .find(el => el && el.id === 'dev-panel');
  const btn = ((panel && panel.children) || []).find(c =>
    typeof c.textContent === 'string' && c.textContent.startsWith('BAN:'));
  ok('the dev overlay carries a BAN toggle that arms/disarms the pref', () => {
    assert.ok(btn, 'the BAN button exists beside AUTO/DNIGHT');
    assert.equal(btn.textContent, 'BAN: OFF');
    btn.click();
    assert.equal(btn.textContent, 'BAN: ON', 'the label repaints');
    assert.equal(h.storage.get(DEV_LS_BAN_ON), '1', 'the arm bit persisted');
    assert.equal(h.T.dev.session.draftBan, true, 'the live session flipped');
    btn.click();
    assert.equal(h.storage.get(DEV_LS_BAN_ON), '0', 'disarm persists too');
    assert.equal(h.T.dev.session.draftBan, false);
  });
}

console.log(`dev draft ban list: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
