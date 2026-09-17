// NITS BUNDLE N1-N5 (audit 2026-09-16, brief docs/briefs/NITS_N1_N6.md — the
// audit is the spec, the brief is the execution contract). One file, one
// section per item, each section RED before its fix lands:
//   N1  runPurse numeric-domain disagreement (int32 |0 vs MAX_SAFE_INTEGER)
//   N2  saveProfileTo drops the custom-key option
//   N3  normalizeAchievements drops unknown ids (a downgrade destroys a newer
//       build's trophies through the structural repair)
//   N4  timed-goal text says "under mm:ss" while the earn check is inclusive
//   N5  the single recovery slot is overwritten by a second incident
// N6 (render caches) is MEASURE-FIRST in real Chrome — tools/verify_nits_n6.mjs
// decides whether it lands at all; its assertions live there (and here only if
// a cache is actually landed).
// Run: node test/test_nits_fixes.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import {
  saveProfileTo, preservePayload, readRecovery,
  RECOVERY_KEY, STORAGE_KEY, PROFILE_VERSION,
} from '../src/save.js';
import { loadProfileResult } from '../src/meta.js';
import {
  normalizeAchievements, ensureAchievements, goalText, recordRun,
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID,
} from '../src/achievements.js';
import { makeProfile } from '../src/meta.js';

const s = suite('test_nits_fixes');

// A minimal synchronous storage for the save-layer sections (test_save.mjs's
// seeded() precedent, inlined so this file stands alone).
class FakeStore {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

// ---- N1: the purse domains must agree — no int32 wrap, exact small values --
// The real read-modify-write path is T.purse (credit/spend/settle), the SAME
// functions a kill, a shrine walk and a run end drive.
const { T, state: st, pump, storage } = await boot({ variant: 'nits' });
{
  T.startRun();
  pump(3);
  s.check('N1: a purse at/past 2^31 cannot wrap negative through the real RMW path', () => {
    T.getProfile().runPurse = 3_000_000_000;            // > 2^31; INSIDE validateProfile's domain
    T.purse.credit({ typeId: 'BRUTE' });                // the real writer
    assert.ok(T.purse.get() >= 0, 'the purse wrapped negative through |0: ' + T.purse.get());
    // Pre-fix the coerced read also makes a loaded purse UNSPENDABLE (the
    // negative compare refuses every amount) — the same wrap, seen from spend.
    assert.equal(T.purse.spend(5), true, 'a 3e9 purse could not spend 5 (negative compare)');
  });
  s.check('N1: a normal purse still credits/spends/settles exactly', () => {
    T.getProfile().runPurse = 40;
    T.purse.credit({ typeId: 'BRUTE' });                // +8 (GOLD_TIER.HEAVY)
    assert.equal(T.purse.get(), 48, 'credit is no longer exact');
    assert.equal(T.purse.spend(20), true);
    assert.equal(T.purse.get(), 28, 'spend is no longer exact');
    T.purse.settle();
    assert.equal(T.purse.get(), 0, 'settle did not zero the purse');
  });
}

// ---- N2: saveProfileTo must honor opts.key like loadProfileFrom does -------
{
  s.check('N2: a custom-key save lands under that key and NOT the default', () => {
    const f = new FakeStore();
    const p = { version: PROFILE_VERSION, gold: 77 };
    assert.equal(saveProfileTo(p, f, { key: 'hordes_slot_b' }), true);
    assert.ok(f.map.has('hordes_slot_b'), 'nothing written under the custom key');
    assert.ok(!f.map.has(STORAGE_KEY), 'the custom save leaked into the default slot');
    assert.equal(JSON.parse(f.map.get('hordes_slot_b')).gold, 77);
  });
  s.check('N2: load with the same key round-trips', () => {
    const f = new FakeStore();
    saveProfileTo({ version: PROFILE_VERSION, gold: 77 }, f, { key: 'hordes_slot_b' });
    const back = loadProfileResult(f, { key: 'hordes_slot_b' });
    assert.notEqual(back.status, 'fresh', 'the custom slot loaded as empty');
    assert.equal(back.profile.gold, 77, 'round-trip lost gold');
  });
  s.check('N2: a no-key save still hits the default slot (byte-identical default)', () => {
    const f = new FakeStore();
    saveProfileTo({ version: PROFILE_VERSION, gold: 5 }, f);
    assert.ok(f.map.has(STORAGE_KEY), 'the default save went missing');
    assert.equal(f.map.size, 1, 'a no-key save touched another key too');
  });
}

// ---- N3: unknown achievement ids survive normalization ---------------------
{
  s.check('N3: normalizeAchievements carries unknown ids verbatim, still repairs KNOWN', () => {
    const out = normalizeAchievements({
      v: 2,
      earned: { NEW_BUILD_TROPHY_2099: 1893456000000, KILLS_100: 'garbage' },
      progress: { NEW_BUILD_TROPHY_2099: 250, WAVE8_UNDER_5MIN: 'x' },
      totals: {}, timed: {},
    });
    assert.equal(out.earned.NEW_BUILD_TROPHY_2099, 1893456000000,
      'the newer build\'s trophy stamp was dropped by repair');
    assert.equal(out.progress.NEW_BUILD_TROPHY_2099, 250, 'the unknown id\'s progress was dropped');
    assert.equal(out.earned.KILLS_100, 1, 'a malformed KNOWN earn must still repair to earned');
    assert.equal(out.progress.WAVE8_UNDER_5MIN, 0, 'a malformed KNOWN progress must still repair to 0');
    // The catalog's own ids are untouched by the preservation.
    assert.ok(ACHIEVEMENT_BY_ID.KILLS_100, 'sanity: KILLS_100 is a catalog id');
  });
  s.check('N3: the ensureAchievements structural repair keeps unknown ids (downgrade scenario)', () => {
    // A newer build's namespace with a BROKEN shape (no progress/totals/timed)
    // triggers exactly the repair a same-version downgrade hits.
    const profile = { achievements: { v: 2, earned: { FUTURE_BUILD_CUP: 42 } } };
    const ns = ensureAchievements(profile);
    assert.equal(ns.earned.FUTURE_BUILD_CUP, 42, 'the repair destroyed the newer trophy');
    assert.ok(ns.progress && ns.totals && ns.timed, 'the repaired shape is incomplete');
  });
}

// ---- N4: timed-goal text must state the inclusive boundary ----------------
{
  s.check('N4: every timed-goal string says "or less", never "under"', () => {
    for (const a of ACHIEVEMENTS.filter(x => x.goal.kind === 'run')) {
      const t = goalText(a);
      assert.match(t, /in \d+:\d\d or less/, a.id + ' does not state the inclusive boundary: ' + t);
      assert.doesNotMatch(t, /under \d/, a.id + ' still claims an exclusive boundary: ' + t);
    }
    // The gallery's trophy descriptions state the same boundary — same fix.
    const art = readFileSync(new URL('../src/art/trophies.js', import.meta.url), 'utf8');
    const unders = [...art.matchAll(/desc: "([^"]*under \d:\d\d[^"]*)"/g)];
    assert.deepEqual(unders.map(m => m[1]), [], 'trophy descs still claim "under": ' +
      unders.map(m => m[1]).join(' | '));
  });
  s.check('N4: the boundary is pinned INCLUSIVE — a run at exactly `within` earns (existing behaviour)', () => {
    const p = makeProfile();
    const res = recordRun(p, { wave: 5, time: 180 });   // WAVE5_UNDER_3MIN, time === within
    assert.ok(res.earned.includes('WAVE5_UNDER_3MIN'),
      'time === within did not earn (rule: rt <= g.within)');
  });
}

// ---- N6: cache-hit proof at the REAL seams (parity is real-Chrome, -------------
// tools/verify_nits_n6_parity.mjs; the brief's decision rule landed both caches
// because the measured per-frame costs were >= 0.1 ms — 0.2388 radar /
// 0.1514 banner, tools/verify_nits_n6.mjs). Here: the second frame must NOT
// rebuild. The counters are on the renderer the real rAF loop paints through.
{
  const R = T.renderer;
  T.startRun();
  pump(2);
  st.radarOn = true;
  pump(3);
  s.check('N6: the radar plate builds EXACTLY once, then blits (counter at the real seam)', () => {
    assert.equal(R.radarPlateBuilds, 1, 'the offscreen plate was rebuilt across frames');
    assert.ok(R.radar && R.radar.counts, 'the radar seam is not live');
    const before = R.radarPlateBuilds;
    pump(5);
    assert.equal(R.radarPlateBuilds, before, 'a later frame rebuilt the static plate');
  });
  // 2026-09-17 retarget: the measureText fit ladder now serves only HELD
  // banners (token / top-tier — the live-comput APPROACH banners render the
  // peripheral horde warning, which has no fit ladder). The fixture is a HELD
  // banner (bannerHold > 0), so the cache contract under test is unchanged.
  s.check('N6: the banner fit runs once per banner STRINGS, refits only on a new banner', () => {
    st.bossBanner = { names: ['GRIMWARDEN THE UNDYING'], verb: 'APPROACHES',
      title: 'GRIMWARDEN THE UNDYING APPROACHES', sub: 'THE CRYPT YAWNS FOR YOU', ttl: 2.5 };
    st.bannerHold = 60;   // held: the cinematic plate path (fit ladder runs)
    pump(1);
    assert.equal(R.bossBannerFits, 1, 'the first banner frame did not fit');
    const f1 = R._bannerFit;
    pump(4);
    assert.equal(R.bossBannerFits, 1, 'a same-strings frame re-ran the measureText ladder');
    assert.equal(R._bannerFit, f1, 'the fit object was replaced on a cache hit');
    st.bossBanner = { names: ['GRIMWARDEN THE UNDYING'], verb: 'APPROACHES',
      title: 'GRIMWARDEN THE UNDYING APPROACHES', sub: 'A DIFFERENT FLAVOR LINE', ttl: 2.5 };
    pump(1);
    assert.equal(R.bossBannerFits, 2, 'a different banner did not refit');
    st.bossBanner = null;
    st.bannerHold = 0;
  });
}

// ---- N5: TWO recovery slots — rotate, latest primary, bounded at two -------
{
  s.check('N5: two sequential corrupt payloads leave both slots, latest primary', () => {
    const f = new FakeStore();
    assert.equal(preservePayload(f, '{bad1', 'corrupt'), true);
    assert.equal(readRecovery(f, RECOVERY_KEY).raw, '{bad1');
    assert.equal(readRecovery(f, RECOVERY_KEY + '.prev'), null,
      'a single incident must not create a .prev slot');
    preservePayload(f, '{bad2', 'corrupt');
    assert.equal(readRecovery(f, RECOVERY_KEY).raw, '{bad2', 'the latest is not primary');
    assert.equal(readRecovery(f, RECOVERY_KEY + '.prev').raw, '{bad1',
      'the prior incident was overwritten (only the latest recoverable)');
    preservePayload(f, '{bad3', 'corrupt');
    assert.equal(readRecovery(f, RECOVERY_KEY).raw, '{bad3');
    assert.equal(readRecovery(f, RECOVERY_KEY + '.prev').raw, '{bad2',
      'the oldest was not rotated out (storage must stay bounded at two)');
  });
  s.check('N5 (retargeted, condense D2): ONE rescue card in SAVE DATA; the .prev slot stays stored but unoffered', () => {
    // Both slots populated the way preservePayload leaves them...
    const mk = (raw) => JSON.stringify({ at: '2026-09-16T00:00:00.000Z', reason: 'corrupt', raw });
    storage.set(RECOVERY_KEY, mk('{latest'));
    storage.set(RECOVERY_KEY + '.prev', mk('{prior'));
    // The recovery offer is TITLE-only, behind SAVE DATA now (condense M3) —
    // open it the real way: title -> SETUP -> SETTINGS -> SAVE DATA.
    const openSaveData = () => {
      T.showTitle();
      const cards = () => [... (globalThis.document.getElementById('ov-cards') || { children: [] }).children];
      const setup = cards().find(k => (k.innerHTML || '').includes('>SETUP<'));
      assert.ok(setup, 'no SETUP card on the title');
      setup.click();
      const settings = cards().find(k => (k.innerHTML || '').includes('>SETTINGS<'));
      assert.ok(settings, 'no SETTINGS card in SETUP');
      settings.click();
      const saveData = cards().find(k => (k.innerHTML || '').includes('>SAVE DATA<'));
      assert.ok(saveData, 'no SAVE DATA card in settings');
      saveData.click();
    };
    openSaveData();
    const cards = [... (globalThis.document.getElementById('ov-cards') || { children: [] }).children]
      .map(k => k.innerHTML || '');
    // D2 (owner ruling 2026-09-17): ONE rescue slot on the surface. The
    // two-slot STORAGE rotation above still holds (this check's first half);
    // the earlier incident is simply not offered a card anymore.
    assert.ok(cards.some(h => h.includes('>RECOVERY FILE<')), 'the primary recovery card went missing');
    assert.ok(!cards.some(h => h.includes('(PREVIOUS)')),
      'the prior slot is offered a card — D2 removed the second rescue card');
    // And when only the primary exists, still exactly one card.
    storage.delete(RECOVERY_KEY + '.prev');
    openSaveData();
    const cards2 = [... (globalThis.document.getElementById('ov-cards') || { children: [] }).children]
      .map(k => k.innerHTML || '');
    assert.ok(cards2.some(h => h.includes('>RECOVERY FILE<')), 'the primary card stays');
    assert.ok(!cards2.some(h => h.includes('(PREVIOUS)')), 'no PREVIOUS card either way');
  });
}

s.done();
