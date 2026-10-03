// The October 2026 update keeps the untouched pre-update save the first time
// an older save is loaded, and never overwrites it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as META from '../src/meta.js';
import { PRE_UPDATE_KEY, BEFORE_UPDATE_KEY, PROFILE_VERSION, STORAGE_KEY, preUpdateText } from '../src/save.js';

function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }, _m: m };
}
let fails = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { fails++; console.log('  FAIL ' + name + '\n' + e.message); } };

const raw = readFileSync(new URL('./fixtures/profile_v10_written_by_v10_build.json', import.meta.url), 'utf8');
const raw11 = readFileSync(new URL('./fixtures/profile_v11_written_by_v11_build.json', import.meta.url), 'utf8');
const raw13 = readFileSync(new URL('./fixtures/profile_v13_written_by_v13_build.json', import.meta.url), 'utf8');

// ---- the reserve from just before THIS build's schema ----------------------------
ok('the slot is named for this build\'s schema', () => {
  assert.equal(BEFORE_UPDATE_KEY, 'hordes_profile_before_v' + PROFILE_VERSION);
});
ok('a save from the last release (v11) is kept byte-for-byte on its first load, and only there', () => {
  const s = store({ [STORAGE_KEY]: raw11 });
  const r = META.loadProfileResult(s);
  assert.equal(r.status, 'migrated');
  assert.equal(s.getItem(BEFORE_UPDATE_KEY), raw11);
  assert.equal(s.getItem(PRE_UPDATE_KEY), null, 'a v11 save is not a pre-overhaul save');
  // The migrated save is written and played on; the reserve does not move.
  r.profile.gold += 123;
  META.saveProfile(r.profile, s);
  const r2 = META.loadProfileResult(s);
  assert.equal(r2.status, 'current');
  assert.equal(s.getItem(BEFORE_UPDATE_KEY), raw11);
});
ok('a pre-overhaul save (v10) fills both slots with the same text', () => {
  const s = store({ [STORAGE_KEY]: raw });
  META.loadProfileResult(s);
  assert.equal(s.getItem(PRE_UPDATE_KEY), raw);
  assert.equal(s.getItem(BEFORE_UPDATE_KEY), raw);
});
ok('a save already at this schema, and a fresh profile, keep nothing', () => {
  const s = store({ [STORAGE_KEY]: raw13 });
  META.loadProfileResult(s);
  assert.equal(s.getItem(BEFORE_UPDATE_KEY), null);
  const e = store();
  META.loadProfileResult(e);
  assert.equal(e.getItem(BEFORE_UPDATE_KEY), null);
});
ok('an older reserve is never overwritten by a later load of an old save', () => {
  const s = store({ [STORAGE_KEY]: raw11, [BEFORE_UPDATE_KEY]: 'the first reserve' });
  META.loadProfileResult(s);
  assert.equal(s.getItem(BEFORE_UPDATE_KEY), 'the first reserve');
});

ok('an old save is kept byte-for-byte on first load', () => {
  const s = store({ [STORAGE_KEY]: raw });
  const r = META.loadProfileResult(s);
  assert.equal(r.status === 'migrated' || r.status === 'repaired', true, r.status);
  assert.equal(s.getItem(PRE_UPDATE_KEY), raw);
  assert.equal(preUpdateText(s), raw);
});
ok('a later load never overwrites the kept save', () => {
  const s = store({ [STORAGE_KEY]: raw });
  const r = META.loadProfileResult(s);
  META.saveProfile(r.profile, s);
  const migrated = s.getItem(STORAGE_KEY);
  assert.notEqual(migrated, raw);
  META.loadProfileResult(s);
  assert.equal(s.getItem(PRE_UPDATE_KEY), raw);
  // even if an old-format save shows up again (an import written back), the first one stays
  s.setItem(STORAGE_KEY, raw.replace('"gold"', '"gold" '));
  META.loadProfileResult(s);
  assert.equal(s.getItem(PRE_UPDATE_KEY), raw);
});
ok('a fresh profile and a current save keep nothing', () => {
  const a = store();
  META.loadProfileResult(a);
  assert.equal(a.getItem(PRE_UPDATE_KEY), null);
  const b = store();
  META.saveProfile(META.makeProfile(), b);
  META.loadProfileResult(b);
  assert.equal(b.getItem(PRE_UPDATE_KEY), null);
  assert.equal(preUpdateText(b), null);
});
ok('a storage that refuses the write does not break the load', () => {
  const s = store({ [STORAGE_KEY]: raw });
  const set = s.setItem;
  s.setItem = (k, v) => { if (k === PRE_UPDATE_KEY) throw new Error('quota'); set(k, v); };
  const r = META.loadProfileResult(s);
  assert.ok(r.profile && r.profile.gold >= 0);
});
if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('test_pre_update_backup: all green');
