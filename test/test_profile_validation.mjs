// HORDES — SAVE HARDENING (agent F, wave-25).
//
// Defect: loadProfile() type-checked equippedCharacter ('is it a string?') but
// never validated it against the CHARACTERS table or unlockedCharacters, and
// it took unlockedCharacters verbatim as long as it was a non-empty array. A
// corrupted or hand-edited save could therefore (a) equip a character the
// player never unlocked — applyCharacter() would then build the whole run
// around her while the menu shows nobody equipped — or (b) drop KNIGHT from
// the unlock list, locking her out of the menu while the run still starts as
// KNIGHT.
//
// Fix: unlockedCharacters is filtered to real CHARACTERS ids, deduped, and
// KNIGHT (free, unlockCost 0) is always present; equippedCharacter must be a
// member of that validated list or it falls back to KNIGHT.
//
// Run: node test/test_profile_validation.mjs   (exit 0 = pass)
import {
  loadProfile, saveProfile, makeProfile, CHARACTERS,
} from '../src/meta.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// In-memory storage fake (test_meta.mjs convention).
function fakeStorage(seed) {
  const map = new Map(seed ? [['hordes_profile_v1', seed]] : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const load = (obj) => loadProfile(fakeStorage(JSON.stringify(obj)));
const valid = (id) => Object.prototype.hasOwnProperty.call(CHARACTERS, id);

console.log('EQUIPPED CHARACTER must be unlocked + real:');
{
  // A locked character must never be equipped (WITCH costs gold to unlock).
  const locked = load({ gold: 0, purchased: {}, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'WITCH' });
  ok(locked.equippedCharacter === 'KNIGHT', `locked character cannot be equipped (got ${locked.equippedCharacter})`);

  // Unknown id -> KNIGHT (the old code let any string through).
  const bogus = load({ gold: 0, purchased: {}, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'DRAGON' });
  ok(bogus.equippedCharacter === 'KNIGHT', `unknown character id falls back to KNIGHT (got ${bogus.equippedCharacter})`);

  // Garbage types stay safe.
  ok(load({ equippedCharacter: 42 }).equippedCharacter === 'KNIGHT', 'numeric id falls back to KNIGHT');
  ok(load({ equippedCharacter: {} }).equippedCharacter === 'KNIGHT', 'object id falls back to KNIGHT');
  ok(load({ equippedCharacter: null }).equippedCharacter === 'KNIGHT', 'null id falls back to KNIGHT');

  // A legitimately unlocked + equipped character survives untouched.
  const good = load({ gold: 0, purchased: {}, unlockedCharacters: ['KNIGHT', 'WITCH'], equippedCharacter: 'WITCH' });
  ok(good.equippedCharacter === 'WITCH', 'a genuinely unlocked character still loads');
}

console.log('UNLOCK LIST is validated + never locks KNIGHT out:');
{
  const junk = load({
    gold: 0, purchased: {},
    unlockedCharacters: ['WITCH', 'WITCH', 'DRAGON', 42, null, {}, 'KNIGHT'],
  });
  ok(junk.unlockedCharacters.every(valid),
    `every loaded unlock is a real character (${JSON.stringify(junk.unlockedCharacters)})`);
  ok(junk.unlockedCharacters.filter(id => id === 'WITCH').length === 1,
    'duplicates collapse');
  ok(junk.unlockedCharacters.includes('KNIGHT'),
    'KNIGHT is always unlocked (she is free — locking her out desyncs the menu from the run)');

  const empty = load({ gold: 0, purchased: {}, unlockedCharacters: [], equippedCharacter: 'WITCH' });
  ok(empty.unlockedCharacters.includes('KNIGHT') && empty.equippedCharacter === 'KNIGHT',
    'empty unlock list -> KNIGHT unlocked + equipped');
  ok(empty.unlockedCharacters.length === 1, 'empty list does not invent other unlocks');

  const nonArray = load({ gold: 0, purchased: {}, unlockedCharacters: 'KNIGHT', equippedCharacter: 'KNIGHT' });
  ok(Array.isArray(nonArray.unlockedCharacters) && nonArray.unlockedCharacters.includes('KNIGHT'),
    'a non-array unlock field degrades to [KNIGHT]');

  // KNIGHT-only saves from before the character economy keep working.
  const knightOnly = load({ gold: 55, purchased: { dmg: 1 }, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT' });
  ok(knightOnly.gold === 55 && knightOnly.purchased.dmg === 1 && knightOnly.equippedCharacter === 'KNIGHT',
    'a clean old-shape save loads with gold + purchases intact');
}

console.log('ROUND TRIP + fresh default unaffected:');
{
  const s = fakeStorage();
  const p = makeProfile();
  p.gold = 900;
  p.unlockedCharacters = ['KNIGHT', 'ROGUE'];
  p.equippedCharacter = 'ROGUE';
  ok(saveProfile(p, s) === true, 'saveProfile still succeeds');
  const back = loadProfile(s);
  ok(back.equippedCharacter === 'ROGUE' && back.unlockedCharacters.length === 2,
    'a valid profile round-trips (unlocks + equip)');
  const fresh = loadProfile(fakeStorage());
  ok(fresh.unlockedCharacters.length === 1 && fresh.unlockedCharacters[0] === 'KNIGHT' &&
     fresh.equippedCharacter === 'KNIGHT', 'a fresh profile is unchanged (KNIGHT only)');
  const corrupt = loadProfile(fakeStorage('{not json'));
  ok(corrupt.equippedCharacter === 'KNIGHT' && corrupt.gold === 0,
    'a corrupt blob still falls back to a fresh profile');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL PROFILE VALIDATION TESTS PASSED');
