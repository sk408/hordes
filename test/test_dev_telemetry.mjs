// HORDES — SLICE 7 dev telemetry + snapshots (node; pure parts need no DOM,
// the gate-off arm boots the real game through test/_harness.mjs).
// Run: node test/test_dev_telemetry.mjs
import assert from 'node:assert';
import {
  isDevGate, formatGameRev, SNAPSHOT_SCHEMA_V, SNAPSHOT_KEYS,
  buildSnapshot, validateSnapshot, devArm, devHit, drawSparkline,
} from '../src/dev_telemetry.js';
import {
  makeProfile, SHOP_BY_ID, buyUpgrade, unlockCharacter, unlockElite,
  ELITE_MODIFIERS, buyCharacterUpgrade, setDevFreeBuild, devFreeBuild,
} from '../src/meta.js';
import { boot } from './_harness.mjs';

function validFields() {
  return {
    schema_v: 2,
    game_rev: 'abc123:dirty',
    seed: 42,
    upgrades: { purchased: { dmg: 1 } },
    shrines: { used: 1, blessings: ['X'] },
    items: [{ id: 'a', rarity: 'COMMON' }],
    gold_earned: 100,
    gold_spent: 25,
    damage: 1000,
    wave: 3,
    test: false,
    speed: 1,
  };
}

// ---- dev gate (fail closed) -------------------------------------------------
{
  assert.equal(isDevGate({ location: { search: '?dev=1' } }), true, '?dev=1 arms');
  assert.equal(isDevGate({ location: { search: '?dev=1&x=2' } }), true, 'extra params keep the gate');
  assert.equal(isDevGate({ location: { search: '?dev=0' } }), false, '?dev=0 is off');
  assert.equal(isDevGate({ location: { search: '' } }), false, 'no query is off');
  assert.equal(isDevGate({ location: {} }), false, 'no search is off');
  assert.equal(isDevGate({}), false, 'no location is off');
  assert.equal(isDevGate(null), false, 'null env is off');
  assert.equal(isDevGate(undefined), false, 'missing env is off');
}

// ---- game_rev format ----------------------------------------------------------
{
  assert.equal(formatGameRev('ABC123', false), 'abc123:clean', 'sha lowercased + clean');
  assert.equal(formatGameRev('de4143e', true), 'de4143e:dirty', 'dirty flag');
  assert.equal(formatGameRev('', false), 'unavailable', 'empty sha is unavailable');
  assert.equal(formatGameRev(null, false), 'unavailable', 'null sha is unavailable');
  assert.equal(formatGameRev('xyz!', false), 'unavailable', 'non-hex sha is unavailable');
}

// ---- snapshot build: exact keys, in order --------------------------------------
{
  const snap = buildSnapshot(validFields());
  assert.deepEqual(Object.keys(snap), SNAPSHOT_KEYS, 'exact schema keys in order');
  assert.equal(snap.schema_v, SNAPSHOT_SCHEMA_V, 'schema_v stamps 1');
  assert.throws(() => buildSnapshot({ ...validFields(), wave: undefined, }),
    /missing key/, 'a missing key throws (half snapshots never save)');
  const { wave, ...rest } = validFields();
  assert.throws(() => buildSnapshot(rest), /missing key/, 'an absent key throws');
}

// ---- snapshot validation: refuse unknown schema_v -------------------------------
{
  assert.equal(validateSnapshot(buildSnapshot(validFields())).ok, true, 'valid snapshot validates');
  const badVer = { ...validFields(), schema_v: 999 };
  const rVer = validateSnapshot(badVer);
  assert.equal(rVer.ok, false, 'unknown schema_v refused');
  assert.match(rVer.errors.join(';'), /schema_v/, 'refusal names schema_v');
  const { seed, ...missing } = validFields();
  assert.equal(validateSnapshot(missing).ok, false, 'missing key fails');
  assert.equal(validateSnapshot({ ...validFields(), wave: '3' }).ok, false, 'wrong type fails');
  assert.equal(validateSnapshot({ ...validFields(), test: 1 }).ok, false, 'bool required for test');
  assert.equal(validateSnapshot({ ...validFields(), damage: Infinity }).ok, false, 'non-finite fails');
  assert.equal(validateSnapshot({ ...validFields(), game_rev: '' }).ok, false, 'empty rev fails');
  assert.equal(validateSnapshot({ ...validFields(), extra: 1 }).ok, true, 'extra keys ignored (version gate owns compat)');
  assert.equal(validateSnapshot(null).ok, false, 'null fails');
  assert.equal(validateSnapshot('x').ok, false, 'non-object fails');
}

// ---- damage accumulator: no-op disarmed, scalar armed ------------------------------
{
  assert.equal(devHit(12.5), 12.5, 'devHit returns its arg (one evaluation at the site)');
  const sink = { dmg: 0 };
  devArm(sink);
  devHit(10); devHit(0.5); devHit(-3); devHit(0); devHit(NaN); devHit(Infinity);
  assert.equal(sink.dmg, 10.5, 'only positive finite hits accumulate');
  devArm(null);
  devHit(99);
  assert.equal(sink.dmg, 10.5, 'disarmed accumulator is untouched');
}

// ---- sparkline painter never throws ----------------------------------------------
{
  drawSparkline(null, [], {});
  drawSparkline(undefined, [{ data: [1, 2] }], { ref: 5 });
  const stubCtx = new Proxy({}, { get: (t, p) => (typeof p === 'string' ? () => {} : undefined), set: () => true });
  drawSparkline({ width: 200, height: 30, getContext: () => stubCtx },
    [{ data: [0, 5, 3] }, { data: [1, 1] }], { ref: 4 });
}

// ---- meta free-build: gold bypassed, caps/ownership still enforced -------------------
{
  assert.equal(devFreeBuild(), false, 'free-build defaults OFF');
  const prof = makeProfile();
  prof.gold = 0;
  setDevFreeBuild(true);
  try {
    assert.equal(devFreeBuild(), true, 'flag arms');
    assert.equal(buyUpgrade(prof, 'dmg'), true, 'free shop level grants with 0 gold');
    assert.equal(prof.gold, 0, 'purse untouched by free shop buy');
    assert.equal(prof.purchased.dmg, 1, 'level recorded');
    assert.equal(unlockCharacter(prof, 'WITCH'), true, 'free character unlock grants');
    assert.equal(prof.gold, 0, 'purse untouched by free unlock');
    assert.ok(prof.unlockedCharacters.includes('WITCH'), 'ownership recorded');
    assert.equal(buyCharacterUpgrade(prof, 'WITCH', 'witch_wellspring'), true, 'free character upgrade grants');
    assert.equal(prof.gold, 0, 'purse untouched by free character upgrade');
    const eliteId = Object.keys(ELITE_MODIFIERS)[0];
    assert.equal(unlockElite(prof, eliteId), true, 'free elite unlock grants');
    assert.equal(prof.gold, 0, 'purse untouched by free elite buy');
    assert.equal(buyUpgrade(prof, 'nope'), false, 'unknown ids still refused when free');
    const def = SHOP_BY_ID.dmg;
    prof.purchased.dmg = def.maxLevel;
    assert.equal(buyUpgrade(prof, 'dmg'), false, 'level caps still enforced when free');
  } finally {
    setDevFreeBuild(false);
  }
  assert.equal(devFreeBuild(), false, 'flag restores OFF');
  const poor = makeProfile();
  poor.gold = 0;
  assert.equal(buyUpgrade(poor, 'dmg'), false, '0 gold buys nothing with the flag off');
}

// ---- gate OFF: the live game carries no dev state -------------------------------------
{
  const h = await boot();
  const T = h.T;
  assert.equal(T.dev.gate, false, 'harness boot (no ?dev=1) leaves the gate off');
  T.startRun();
  h.pump(5);
  assert.equal(T.dev.session, null, 'no dev session with the gate off');
  assert.deepEqual(Object.keys(h.state.runCounts.gold).sort(),
    ['earned', 'kills', 'spent'], 'no sink split leaks into run state');
  assert.equal(typeof T.dev.onRunEnd, 'function', 'the seam exists even gated off');
  T.dev.onRunEnd();
  assert.equal(T.dev.session, null, 'onRunEnd is a no-op with the gate off');
}

console.log('test_dev_telemetry: all checks passed');
