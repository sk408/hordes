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

// ---- slice-9 optionals: pass-through, order, type gates -------------------------
{
  const withOpt = buildSnapshot({ ...validFields(), choices: { drafts: [] }, mode: 'standard', modifiers: [] });
  assert.deepEqual(Object.keys(withOpt),
    [...SNAPSHOT_KEYS, 'choices', 'mode', 'modifiers'], 'optionals append after the required keys');
  assert.deepEqual(withOpt.choices, { drafts: [] }, 'choices passes through');
  assert.equal(withOpt.mode, 'standard', 'mode passes through');
  // Absent optionals = byte-identical to a slice-8 snapshot (the exact-keys
  // contract above still holds).
  assert.deepEqual(Object.keys(buildSnapshot(validFields())), SNAPSHOT_KEYS, 'no optionals, no extra keys');
  assert.throws(() => buildSnapshot({ ...validFields(), choices: 7 }), /bad choices/, 'bad choices throws');
  assert.throws(() => buildSnapshot({ ...validFields(), mode: '' }), /bad mode/, 'empty mode throws');
  assert.throws(() => buildSnapshot({ ...validFields(), modifiers: 'x' }), /bad modifiers/, 'non-array modifiers throws');
  assert.throws(() => buildSnapshot({ ...validFields(), modifiers: [1] }), /bad modifiers/, 'non-string modifier throws');
  // Validation: absent optionals validate (old writers predate them); present
  // optionals are type-checked.
  assert.equal(validateSnapshot(buildSnapshot(validFields())).ok, true, 'no optionals still valid');
  assert.equal(validateSnapshot(withOpt).ok, true, 'valid optionals validate');
  assert.equal(validateSnapshot({ ...validFields(), choices: 7 }).ok, false, 'bad choices fails');
  assert.equal(validateSnapshot({ ...validFields(), mode: 7 }).ok, false, 'bad mode fails');
  assert.equal(validateSnapshot({ ...validFields(), modifiers: [1] }).ok, false, 'bad modifiers fails');
}

// ---- slice-9 choice audit + mode, headless ?dev=1 run -----------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'slice9' });
  const T = h.T;
  assert.equal(T.dev.gate, true, 'the ?dev=1 boot arms the gate');
  T.startRun();
  h.pump(3);
  assert.ok(T.dev.session, 'a dev session is live');
  // DRAFT: open the real offer row, take the first card through the real pick.
  T.openDraft();
  const offers = T.dev.draftOffers;
  assert.ok(offers.length >= 3, 'a draft offers 3+ cards');
  const takeId = offers[0].id;
  T.pickCard(offers[0]);
  // SHRINE FIRST (the chest buy re-renders the intermission, which parks the
  // sim — the walk-up sale needs mode 'playing'): teleport onto the first
  // altar with a funded purse, pump until the sale fires through the real
  // proximity path.
  T.getProfile().runPurse = 50000;
  {
    const sh = h.state.shrines.find(s => !s.used);
    assert.ok(sh, 'a shrine altar exists');
    h.state.player.x = sh.x; h.state.player.y = sh.y;
    let bought = false;
    for (let i = 0; i < 30 && !bought; i++) {
      h.pump(1);
      bought = T.dev.session.shrineBuys.length > 0;
    }
    assert.ok(bought, 'the walk-up shrine sale fired');
  }
  // SHOP (paid chest): buy BRONZE through the real path (funded purse above).
  T.dev.buyChest('BRONZE');
  // INTERMISSION BLESSING: roll the real offers, take one through takeChoice.
  {
    const { rollChoices } = await import('../src/choices.js');
    const bOffers = rollChoices(h.state.wave.num, Math.random, h.state.takenChoices);
    assert.ok(bOffers.length > 0, 'blessing offers roll');
    h.state.pendingChoiceOffers = bOffers;
    T.dev.takeBlessing(bOffers[0]);
  }
  // MODE FIELDS: live reads — standard run, no penalty modifier.
  {
    const mf = T.dev.modeFields();
    assert.equal(mf.mode, 'standard', 'non-night run reports standard mode');
    assert.deepEqual(mf.modifiers, [], 'a plain run carries no modifiers');
  }
  T.dev.onRunEnd();
  const snap = T.dev.session.snapshot;
  assert.ok(snap, 'the end-of-run snapshot built');
  assert.equal(validateSnapshot(snap).ok, true, 'the audited snapshot validates');
  assert.equal(snap.choices.drafts.length >= 1, true, 'drafts recorded');
  assert.deepEqual(snap.choices.drafts[0].taken, takeId, 'the draft taken id matches the pick');
  assert.ok(snap.choices.drafts[0].offered.includes(takeId), 'taken is a member of offered');
  assert.equal(snap.choices.chests.length, 1, 'the chest gamble recorded');
  assert.equal(snap.choices.chests[0].tier, 'BRONZE', 'the chest tier recorded');
  assert.ok(snap.choices.shrines.length >= 1, 'the shrine buy recorded');
  assert.equal(snap.choices.blessings.length, 1, 'the blessing pick recorded');
  assert.ok(snap.choices.blessings[0].taken, 'the blessing taken id set');
  assert.equal(snap.mode, 'standard', 'mode stamped on the snapshot');
  assert.deepEqual(snap.modifiers, [], 'modifiers stamped on the snapshot');
  // NIGHT MODE: the stamp + the live penalty modifier (percent off the live
  // RUN_GOLD constant, never a hardcoded string).
  {
    const { RUN_GOLD } = await import('../src/meta.js');
    T.night.press(); T.night.press();   // two-press confirm: ARMED then ON
    assert.equal(T.night.on, true, 'night session on');
    T.startRun();
    assert.equal(T.night.run, true, 'the run carries the night stamp');
    const mf = T.dev.modeFields();
    assert.equal(mf.mode, 'night', 'night run reports night mode');
    assert.ok(mf.modifiers.includes('banking-penalty-' + RUN_GOLD.NIGHT_PENALTY_PCT),
      'the live banking-penalty modifier is stamped');
  }
}

// ---- slice-9 overlay placement: docked clear + collapsible --------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'slice9panel' });
  const T = h.T;
  T.startRun();
  h.pump(1);
  const panel = T.dev.panel;
  assert.ok(panel && panel.box, 'the dev panel node exists');
  const css = panel.box.style.cssText;
  assert.match(css, /left:8px/, 'the panel docks LEFT (clear of the top-right cog row)');
  assert.doesNotMatch(css, /right:8px/, 'the old top-right dock is gone');
  assert.equal(panel.collapsed, false, 'default EXPANDED (telemetry reads at a glance)');
  assert.equal(panel.read.style.display, '', 'readout visible by default');
  panel.title.click();   // the header toggles collapse (the same path a tap drives)
  assert.equal(panel.collapsed, true, 'header tap collapses');
  assert.equal(panel.read.style.display, 'none', 'collapsed hides the readout');
  assert.equal(panel.cvGold.style.display, 'none', 'collapsed hides the sparklines');
  panel.title.click();
  assert.equal(panel.collapsed, false, 'header tap re-expands');
  assert.equal(panel.read.style.display, '', 'readout back after expand');
}

console.log('test_dev_telemetry: all checks passed');
