// A save an older build wrote over is put back on boot.
//
// An older build that meets a newer save keeps it in the recovery slot
// ('future-version') and, before the newer-save guard, saved a fresh profile
// over it. The next boot of a build that can read the kept save restores it
// once, with a notice, and keeps the replaced save downloadable.
//
// Fixtures: profile_v13_written_by_v13_build.json is the v11 fixture loaded by
// this build (refund paid) with some camp/world progress;
// profile_v11_fresh_saved_over_v13_by_v11_build.json is what the v11 release
// build (before its guard) saved over it.
//
// Run: node test/test_save_restore.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as META from '../src/meta.js';
import {
  STORAGE_KEY, RECOVERY_KEY, RECOVERY_PREV_KEY, PRE_UPDATE_KEY, PROFILE_VERSION,
  readRecovery, recoveryExportText, preservePayload,
} from '../src/save.js';
import { boot } from './_harness.mjs';

const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8').trim();
const V13 = fixture('profile_v13_written_by_v13_build.json');
const JUNK = fixture('profile_v11_fresh_saved_over_v13_by_v11_build.json');
const V11 = fixture('profile_v11_written_by_v11_build.json');
const V10 = fixture('profile_v10_written_by_v10_build.json');

function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }, _m: m };
}
const kept = (raw, reason = 'future-version') => JSON.stringify({ at: '2026-10-03T00:00:00.000Z', reason, raw });

let fails = 0;
const ok = async (name, fn) => {
  try { await fn(); console.log('  ok  ' + name); } catch (e) { fails++; console.log('  FAIL ' + name + '\n' + e.message); }
};

await ok('a save an older build wrote over is restored on load', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13) });
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, true);
  assert.equal(r.status, 'current');
  assert.ok(/RESTORED/.test(r.notice || ''), r.notice);
  assert.equal(r.profile.gold, 19890);
  assert.equal(r.profile.camp.levels.mine, 2);
  assert.equal(r.profile.world.questsDone, 2);
  assert.deepEqual(r.profile.world.glyphs, ['ash']);
  assert.equal(r.profile.achievements.totals.runs, 9);
  assert.equal(s.getItem(STORAGE_KEY), V13, 'the kept save is back under the main key');
});

await ok('no refund is paid twice', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13) });
  const p = META.loadProfileResult(s).profile;
  assert.equal(p.gold, JSON.parse(V13).gold);
  assert.deepEqual(p.campRefund, { version: 12, gold: 3840 });
  assert.equal(p.purchased.artifact, undefined);
  assert.equal(p.banners.camp_refund_v12, 1, 'the refund note stays seen');
});

await ok('the replaced save stays downloadable', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13) });
  META.loadProfileResult(s);
  const rec = readRecovery(s);
  assert.equal(rec.reason, 'replaced');
  assert.equal(rec.raw, JUNK);
  assert.equal(recoveryExportText(s), JUNK);
  assert.equal(readRecovery(s, RECOVERY_PREV_KEY).raw, V13);
});

await ok('it happens once: the next boot loads the save as it is', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13) });
  const first = META.loadProfileResult(s).profile;
  first.gold += 5;
  assert.equal(META.saveProfile(first, s), true);
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, false);
  assert.equal(r.notice, null);
  assert.equal(r.profile.gold, 19895, 'progress after the restore is kept');
});

await ok('end to end: v11 save, update, old tab saves over it, update again', () => {
  const s = store({ [STORAGE_KEY]: V11 });
  const a = META.loadProfileResult(s);
  assert.equal(a.status, 'migrated');
  assert.equal(a.profile.gold, 16050 + 1200 + 2640, 'the Starting Artifact is refunded once');
  a.profile.camp.levels.mine = 1;
  META.saveProfile(a.profile, s);
  const mine = s.getItem(STORAGE_KEY);
  // What the v11 build did: keep the newer save, then save a fresh profile over it.
  preservePayload(s, mine, 'future-version');
  s.setItem(STORAGE_KEY, JUNK);
  const b = META.loadProfileResult(s);
  assert.equal(b.restored, true);
  assert.equal(b.profile.gold, a.profile.gold, 'gold is the same as before: no second refund, nothing lost');
  assert.equal(b.profile.camp.levels.mine, 1);
  assert.equal(s.getItem(PRE_UPDATE_KEY), null, 'a v11 save never fills the pre-update slot');
});

await ok('a kept v11 save over a v10 build\'s fresh save migrates once', () => {
  const s = store({ [STORAGE_KEY]: JSON.stringify({ version: 10, gold: 0, purchased: {} }), [RECOVERY_KEY]: kept(V11) });
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, true);
  assert.equal(r.status, 'migrated');
  assert.equal(r.profile.gold, 16050 + 1200 + 2640);
  assert.deepEqual(r.profile.campRefund, { version: 12, gold: 3840 });
  assert.equal(s.getItem(PRE_UPDATE_KEY), null, 'the fresh v10 save is not kept as the pre-update save');
});

await ok('the pre-update save is left alone by a restore', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13), [PRE_UPDATE_KEY]: V10 });
  META.loadProfileResult(s);
  assert.equal(s.getItem(PRE_UPDATE_KEY), V10);
});

await ok('a kept save in the older slot is found too', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept('{bad', 'corrupt'), [RECOVERY_PREV_KEY]: kept(V13) });
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, true);
  assert.equal(r.profile.gold, 19890);
});

await ok('nothing is restored over a save at the same version (a reset stays a reset)', () => {
  const s = store({ [RECOVERY_KEY]: kept(V13) });
  META.saveProfile(META.makeProfile(), s);
  const before = s.getItem(STORAGE_KEY);
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, false);
  assert.equal(r.profile.gold, 0);
  assert.equal(s.getItem(STORAGE_KEY), before);
});

await ok('a save that went further in the older build is kept, and the kept save stays downloadable', () => {
  // The player was "wiped" by the old tab, then played 40 runs there.
  const further = JSON.parse(V11);
  further.achievements.totals.runs = 40;
  further.gold = 55555;
  const raw = JSON.stringify(further);
  const s = store({ [STORAGE_KEY]: raw, [RECOVERY_KEY]: kept(V13) });
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, false);
  assert.equal(r.status, 'migrated');
  assert.equal(r.profile.achievements.totals.runs, 40);
  assert.equal(s.getItem(STORAGE_KEY), raw, 'the main save is not replaced');
  assert.equal(readRecovery(s).raw, V13, 'the kept save is still in the recovery slot');
  // Fewer runs than the kept save: the kept save comes back, as before.
  further.achievements.totals.runs = 8;
  const s2 = store({ [STORAGE_KEY]: JSON.stringify(further), [RECOVERY_KEY]: kept(V13) });
  assert.equal(META.loadProfileResult(s2).restored, true);
});

await ok('nothing is restored from a save newer than this build, a damaged copy, or into an empty or damaged slot', () => {
  const newer = JSON.stringify({ ...JSON.parse(V13), version: PROFILE_VERSION + 1 });
  const a = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(newer) });
  const ra = META.loadProfileResult(a);
  assert.equal(ra.restored, false);
  assert.equal(ra.profile.gold, 0);
  assert.equal(a.getItem(STORAGE_KEY), JUNK);

  const b = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13, 'corrupt') });
  assert.equal(META.loadProfileResult(b).restored, false);

  const c = store({ [RECOVERY_KEY]: kept(V13) });
  const rc = META.loadProfileResult(c);
  assert.equal(rc.status, 'fresh');
  assert.equal(rc.restored, false);

  const d = store({ [STORAGE_KEY]: '{not json', [RECOVERY_KEY]: kept(V13) });
  const rd = META.loadProfileResult(d);
  assert.equal(rd.status, 'corrupt');
  assert.equal(rd.restored, false);
});

await ok('a storage that refuses writes still plays the restored save', () => {
  const s = store({ [STORAGE_KEY]: JUNK, [RECOVERY_KEY]: kept(V13) });
  s.setItem = () => { throw new Error('quota'); };
  const r = META.loadProfileResult(s);
  assert.equal(r.restored, true);
  assert.equal(r.profile.gold, 19890);
});

await ok('boot shows the restore on the title', async () => {
  const h = await boot({
    storage: [
      [STORAGE_KEY, JUNK],
      [RECOVERY_KEY, kept(V13)],
      ['hordes_onboarded', '1'],
    ],
  });
  for (let i = 0; i < 1200; i++) {
    h.pump(1);
    const t = h.elements['ov-title'];
    if (t && t.textContent === 'HORDES') break;
  }
  assert.ok(/RESTORED/.test(h.T.save.notice || ''), String(h.T.save.notice));
  assert.equal(h.T.getProfile().gold, 19890);
  assert.ok(/RESTORED/.test(h.elements['ov-sub'].innerHTML || ''), 'the title shows the notice');
});

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('test_save_restore: all green');
