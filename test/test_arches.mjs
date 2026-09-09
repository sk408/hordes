// HORDES — unit tests for src/arches.js (node, no DOM). Deterministic rng stub.
import assert from 'node:assert';
import { ARCH_TYPES, ARCH, spawnArch, tickArches, activeArchMods } from '../src/arches.js';

const seq = (vals) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error(`rng exhausted (call ${i + 1})`);
    return vals[i++];
  };
};
const mkState = () => ({ player: { x: 0, y: 0 }, arches: [], archBuffs: [] });

// ---------- spawn determinism + type table ----------
{
  assert.strictEqual(Object.keys(ARCH_TYPES).length, 5, 'five arch types');
  // TYPE_IDS order: DOUBLE_FIRE, MAGNET, SHIELD, BERSERK, SWIFT.
  const a0 = spawnArch(seq([0.0]), 10, 20);
  assert.strictEqual(a0.type, 'DOUBLE_FIRE', 'rng 0.0 -> first type');
  assert.strictEqual(a0.x, 10); assert.strictEqual(a0.y, 20);
  const a4 = spawnArch(seq([0.999]), 0, 0);
  assert.strictEqual(a4.type, 'SWIFT', 'rng ~1 -> last type');
  // Durations inside the 60-90s band from the spec.
  for (const def of Object.values(ARCH_TYPES)) {
    assert.ok(def.duration >= 60 && def.duration <= 90, `${def.id} duration in 60-90s`);
    assert.ok(def.desc && def.name, `${def.id} has name + desc for the UI`);
  }
  console.log('ok: spawnArch deterministic; 5 types with 60-90s durations');
}

// ---------- grant: walks under -> buff + event; outside -> untouched ------
{
  const st = mkState();
  const arch = spawnArch(seq([0.0]), st.player.x, st.player.y);   // right on top
  st.arches.push(arch);
  const ev = tickArches(st, 0.016);
  assert.strictEqual(st.arches.length, 0, 'arch is consumed by activation');
  const g = ev.find(e => e.kind === 'archGranted');
  assert.ok(g, 'activation emits archGranted');
  assert.strictEqual(g.type, 'DOUBLE_FIRE');
  assert.deepStrictEqual(g.mods, { rateMult: 2 });
  assert.strictEqual(g.duration, ARCH_TYPES.DOUBLE_FIRE.duration);
  assert.strictEqual(st.archBuffs.length, 1, 'buff is active');

  // Far away: no trigger.
  const st2 = mkState();
  st2.arches.push(spawnArch(seq([0.0]), st2.player.x + 100, st2.player.y));
  assert.strictEqual(tickArches(st2, 0.016).length, 0, 'no events for a distant arch');
  assert.strictEqual(st2.arches.length, 1, 'distant arch stays on the field');
  assert.strictEqual(st2.archBuffs.length, 0);
  // Edge of the radius (exactly ACTIVATE_R) still triggers.
  const st3 = mkState();
  st3.arches.push(spawnArch(seq([0.0]), st3.player.x + ARCH.ACTIVATE_R, st3.player.y));
  assert.ok(tickArches(st3, 0.016).some(e => e.kind === 'archGranted'),
    'activation radius is inclusive');
  console.log('ok: grant inside radius only; arch consumed');
}

// ---------- expiry timing ----------
{
  const st = mkState();
  st.arches.push(spawnArch(seq([0.0]), 0, 0));
  let events = tickArches(st, 0.016);   // granted; timer now ticking
  const dur = ARCH_TYPES.DOUBLE_FIRE.duration;
  // Tick almost to the end: still active.
  for (let i = 0; i < Math.floor(dur / 0.1) - 1; i++) events = tickArches(st, 0.1);
  assert.strictEqual(st.archBuffs.length, 1, 'buff still active just before expiry');
  assert.ok(!events.some(e => e.kind === 'archExpired'));
  // Cross the line: expired event, buff removed.
  const ev = tickArches(st, 0.5);
  assert.ok(ev.some(e => e.kind === 'archExpired' && e.type === 'DOUBLE_FIRE'),
    'expiry emits archExpired');
  assert.strictEqual(st.archBuffs.length, 0);
  assert.deepStrictEqual(activeArchMods(st),
    { rateMult: 1, pickupMult: 1, damageMult: 1, speedMult: 1, shieldHits: 0 },
    'mods back to neutral after expiry');
  console.log('ok: arch expires on its timer with an event');
}

// ---------- no double-activation / no same-type stacking ------------------
{
  const st = mkState();
  // Two SWIFT arches (rng 1.0 -> index floor(1*5)=5? clamp: floor(0.999*5)=4).
  st.arches.push(spawnArch(seq([0.999]), 0, 0));          // SWIFT
  st.arches.push(spawnArch(seq([0.999]), st.player.x + 5, st.player.y)); // SWIFT too
  let ev = tickArches(st, 0.016);
  assert.strictEqual(st.arches.length, 0, 'both arches consumed on contact');
  assert.strictEqual(ev.filter(e => e.kind === 'archGranted').length, 1,
    'first contact grants');
  assert.strictEqual(ev.filter(e => e.kind === 'archRefreshed').length, 1,
    'same-tick second contact of the SAME type refreshes instead');
  assert.strictEqual(st.archBuffs.length, 1, 'same type never stacks: ONE buff entry');

  // Burn 10s, then walk under a third SWIFT arch: refreshed, not added.
  for (let i = 0; i < 100; i++) tickArches(st, 0.1);
  const tBefore = st.archBuffs[0].t;
  assert.ok(tBefore < ARCH_TYPES.SWIFT.duration - 9, 'timer has burned down');
  st.arches.push(spawnArch(seq([0.999]), 0, 0));
  ev = tickArches(st, 0.016);
  assert.ok(ev.some(e => e.kind === 'archRefreshed' && e.type === 'SWIFT'),
    're-activation emits archRefreshed');
  assert.strictEqual(st.archBuffs.length, 1, 'still exactly one SWIFT buff');
  assert.ok(st.archBuffs[0].t >= ARCH_TYPES.SWIFT.duration - 0.016,
    'refresh resets the timer to full duration');
  console.log('ok: same-type arch refreshes (never stacks)');
}

// ---------- different types DO stack; combined mods; SHIELD hits ----------
{
  const st = mkState();
  // SWIFT (idx 4) + BERSERK (idx 3): both walk-unders the same frame.
  st.arches.push(spawnArch(seq([0.999]), 0, 0));
  st.arches.push(spawnArch(seq([0.7]), 3, 0));   // idx 3 -> BERSERK
  const ev = tickArches(st, 0.016);
  assert.strictEqual(ev.filter(e => e.kind === 'archGranted').length, 2,
    'both grants land');
  assert.strictEqual(st.archBuffs.length, 2, 'different types run concurrently');
  const m = activeArchMods(st);
  assert.ok(Math.abs(m.speedMult - 1.4 * 0.75) < 1e-12,
    'speedMult combines SWIFT x1.4 with BERSERK x0.75');
  assert.ok(Math.abs(m.damageMult - 1.5) < 1e-12, 'berserker damageMult applies');

  // SHIELD: grants absorbs, not a stat mult.
  const st2 = mkState();
  st2.arches.push(spawnArch(seq([0.4]), 0, 0));   // idx floor(0.4*5)=2 -> SHIELD
  const ev2 = tickArches(st2, 0.016);
  const g = ev2.find(e => e.kind === 'archGranted');
  assert.strictEqual(g.type, 'SHIELD');
  assert.strictEqual(g.shieldHits, 3, 'shield grants 3 absorbs');
  assert.strictEqual(activeArchMods(st2).shieldHits, 3);
  console.log('ok: cross-type stacking + SHIELD absorb contract');
}

console.log('ARCHES TESTS PASSED');
