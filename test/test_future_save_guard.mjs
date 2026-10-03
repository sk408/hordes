// An old build (this one) must never write over a save made by a newer build.
import assert from 'node:assert/strict';
import * as META from '../src/meta.js';
import { STORAGE_KEY, PROFILE_VERSION } from '../src/save.js';

function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}
let fails = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { fails++; console.log('  FAIL ' + name + '\n' + e.message); } };

const newer = JSON.stringify({ version: PROFILE_VERSION + 2, gold: 123456, camp: { levels: { mine: 3 } }, world: { glyphs: ['A'] } });

ok('a newer save loads as a fresh in-memory profile with a refresh notice', () => {
  const s = store({ [STORAGE_KEY]: newer });
  const r = META.loadProfileResult(s);
  assert.equal(r.status, 'future-version');
  assert.ok(/Refresh the page/i.test(r.notice), r.notice);
});
ok('saving from the old build leaves the newer save byte-for-byte', () => {
  const s = store({ [STORAGE_KEY]: newer });
  const r = META.loadProfileResult(s);
  r.profile.gold = 5;
  assert.equal(META.saveProfile(r.profile, s), false, 'the write is refused');
  assert.equal(s.getItem(STORAGE_KEY), newer);
});
ok('a save at this version or older is still written normally', () => {
  const s = store();
  const p = META.makeProfile(); p.gold = 77;
  assert.equal(META.saveProfile(p, s), true);
  assert.equal(JSON.parse(s.getItem(STORAGE_KEY)).gold, 77);
  const older = store({ [STORAGE_KEY]: JSON.stringify({ version: PROFILE_VERSION - 1, gold: 9 }) });
  assert.equal(META.saveProfile(p, older), true);
});
ok('an unreadable stored payload does not block a save', () => {
  const s = store({ [STORAGE_KEY]: '{not json' });
  assert.equal(META.saveProfile(META.makeProfile(), s), true);
});
if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('test_future_save_guard: all green');
