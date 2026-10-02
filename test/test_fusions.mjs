// WEAPON FUSIONS: the rules (fusions.js), and each fusion in the real loop —
// its requirement, the freed slot, the behaviour that marks it, its card text.
// Run: node test/test_fusions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import {
  FUSION_DEFS, FUSION_MULT, fusionCandidates, fuseWeapons, fusionProgress, fusionRoadText,
  describeFusion, fusionsFor, kitWeapons, findKitWeapon, fusionByBodyKind, fusionDef,
} from '../src/fusions.js';
import { EVOLUTION_DEFS, evolveWeapon } from '../src/evolutions.js';
import { WEAPONS, WEAPON_MAX_LEVEL, WEAPON_NAMES, WEAPON_TYPES, makeWeapon, weaponLevelParams } from '../src/weapons.js';

const s = suite('test_fusions');

// A weapon at max level in its evolved form.
function evolved(type) {
  const w = makeWeapon(type);
  w.level = WEAPON_MAX_LEVEL;
  const r = evolveWeapon(w, { [EVOLUTION_DEFS[type].partner]: 1 });
  assert.equal(r.ok, true, type + ' evolves');
  return w;
}

// ---------------------------------------------------------------- the table
s.check('the table: 8-12 fusions, unique ids, names and pairs, every weapon has a fusion', () => {
  assert.ok(FUSION_DEFS.length >= 8 && FUSION_DEFS.length <= 12, 'count ' + FUSION_DEFS.length);
  const ids = new Set(), names = new Set(), pairs = new Set(), used = new Set();
  for (const d of FUSION_DEFS) {
    assert.equal(d.pair.length, 2);
    assert.notEqual(d.pair[0], d.pair[1], d.id + ': no self pair');
    for (const t of d.pair) { assert.ok(WEAPON_NAMES[t], d.id + ': unknown weapon ' + t); used.add(t); }
    assert.ok(EVOLUTION_DEFS[d.pair[0]] && EVOLUTION_DEFS[d.pair[1]], d.id + ': both halves can evolve');
    // The Volley holds no slot, so it is always the host: its partner's slot is the one freed.
    assert.notEqual(d.pair[1], 'VOLLEY', d.id + ': the Volley is the host');
    ids.add(d.id); names.add(d.name); pairs.add([...d.pair].sort().join('+'));
    assert.ok(d.desc.length > 20 && d.desc.length <= 130, d.id + ': one line of text (' + d.desc.length + ')');
    assert.ok(Object.keys(d.flags).length >= 1, d.id + ': a link behaviour, not only a multiplier');
    assert.equal(d.tint.length, 2);
    assert.equal(d.mark.length, 5);
    for (const row of d.mark) assert.ok(/^[.ab]{5}$/.test(row), d.id + ': emblem row ' + row);
  }
  assert.equal(ids.size, FUSION_DEFS.length);
  assert.equal(names.size, FUSION_DEFS.length);
  assert.equal(pairs.size, FUSION_DEFS.length, 'no pair listed twice');
  for (const t of Object.keys(WEAPON_NAMES)) assert.ok(used.has(t), t + ' has at least one fusion');
  assert.ok(new Set(FUSION_DEFS.map(d => d.tint.join())).size === FUSION_DEFS.length, 'every fusion has its own colours');
  assert.ok(new Set(FUSION_DEFS.map(d => d.mark.join())).size === FUSION_DEFS.length, 'every fusion has its own emblem');
});

s.check('every fusion flag is read by the game', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8') +
    readFileSync(new URL('../src/weapons.js', import.meta.url), 'utf8');
  for (const d of FUSION_DEFS) {
    for (const f of Object.keys(d.flags)) {
      assert.ok(src.includes("fus('" + f + "')") || src.includes("fusFlag(weapon, '" + f + "')") ||
        src.includes("fusOwner('" + f + "')"), d.name + ': flag ' + f + ' is never read');
    }
  }
});

s.check('the old synergy module, toasts and hints are gone', () => {
  let gone = false;
  try { readFileSync(new URL('../src/synergies.js', import.meta.url)); } catch { gone = true; }
  assert.ok(gone, 'src/synergies.js is deleted');
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const word of ['SYNERGY:', 'refreshSynergies', 'synergyHintForCard', 'detectSynergies', 'state.synergies']) {
    assert.ok(!src.includes(word), 'main.js still mentions ' + word);
  }
});

// ---------------------------------------------------------------- the rules
for (const def of FUSION_DEFS) {
  s.check(def.name + ': needs both halves in the kit and both evolved; fusing frees one place', () => {
    const [a, b] = def.pair;
    // one half missing
    assert.equal(fuseWeapons([evolved(a)], def).reason, 'pair');
    assert.equal(fusionCandidates([evolved(a)]).length, 0);
    // a half not evolved (max level alone is not enough)
    const raw = makeWeapon(b); raw.level = WEAPON_MAX_LEVEL;
    const half = [evolved(a), raw];
    assert.equal(fusionCandidates(half).length, 0);
    assert.equal(fuseWeapons(half, def).reason, 'evolved');
    assert.equal(half.length, 2, 'a refused fusion changes nothing');
    // both evolved
    const other = makeWeapon(Object.keys(WEAPON_TYPES).find(t => !def.pair.includes(t)));
    const kit = [evolved(a), other, evolved(b)];
    const cands = fusionCandidates(kit).filter(c => c.def.id === def.id);
    assert.equal(cands.length, 1, 'offered');
    assert.equal(cands[0].host.type, a);
    const res = fuseWeapons(kit, def);
    assert.equal(res.ok, true);
    assert.equal(res.name, def.name);
    assert.equal(kit.length, 2, 'one place in the list is free');
    assert.deepEqual(kit.map(w => w.type), [a, other.type]);
    assert.equal(kit[0].fusionId, def.id);
    assert.equal(kit[0].fused.type, b, 'the host carries the other half');
    assert.equal(kit[0].fusion.mult, FUSION_MULT);
    assert.equal(kit[0].fused.fusion.mult, FUSION_MULT, 'both halves carry the fusion multiplier');
    assert.ok(kit[0].fusion.mult > 1.25, 'a clear step above the two evolved weapons');
    assert.deepEqual(kit[0].fusion.flags, def.flags);
    assert.equal(kitWeapons(kit).length, 3, 'both halves still act');
    assert.equal(findKitWeapon(kit, b), kit[0].fused);
    // once only
    assert.equal(fuseWeapons(kit, def).reason, 'pair');
    assert.equal(fusionCandidates(kit).length, 0, 'a fused weapon enters no second fusion');
    for (const d2 of fusionsFor(a)) if (d2.id !== def.id) {
      const k2 = [...kit, evolved(d2.pair[0] === a ? d2.pair[1] : d2.pair[0])];
      assert.ok(!fusionCandidates(k2).some(c => c.def.id === d2.id), a + ' is spent: no ' + d2.name);
    }
  });
}

s.check('deferred offers are hidden; unknown fusions are refused', () => {
  const def = FUSION_DEFS[0];
  const kit = [evolved(def.pair[0]), evolved(def.pair[1])];
  assert.equal(fusionCandidates(kit, new Set([def.id])).length, 0);
  assert.equal(fusionCandidates(kit, new Set()).length, 1);
  assert.equal(fuseWeapons(kit, 'NOPE').reason, 'fusion');
  assert.equal(fuseWeapons(kit, { id: 'NOPE' }).reason, 'fusion');
  assert.equal(describeFusion('NOPE'), null);
  assert.equal(fusionDef(def.id), def);
});

s.check('card text: the fusion road names the partner; describeFusion carries name, pair and one line', () => {
  for (const def of FUSION_DEFS) {
    const [a, b] = def.pair;
    const wa = makeWeapon(a), wb = makeWeapon(b);
    const kit = [wa, wb];
    assert.equal(fusionRoadText(wa, kit), 'fuses with ' + WEAPON_NAMES[b] + ' once both are evolved');
    assert.equal(fusionRoadText(wb, kit), 'fuses with ' + WEAPON_NAMES[a] + ' once both are evolved');
    // a partner the kit does not hold is not promised on a draft card...
    assert.equal(fusionRoadText(wa, [wa]), '');
    // ...but the STATS screen lists the whole road
    const all = fusionRoadText(wa, [wa], true);
    assert.ok(all.startsWith('fuses with ') && all.includes(WEAPON_NAMES[b]) && all.endsWith('(not in this kit)'), all);
    const d = describeFusion(def);
    assert.equal(d.name, def.name);
    assert.deepEqual(d.pairNames, [WEAPON_NAMES[a], WEAPON_NAMES[b]]);
    assert.equal(d.desc, def.desc);
    const pr = fusionProgress(wa, kit);
    assert.ok(pr.options.find(o => o.def.id === def.id).inKit);
    assert.equal(pr.options.find(o => o.def.id === def.id).ready, false);
    const ek = [evolved(a), evolved(b)];
    assert.ok(fusionRoadText(ek[0], ek).startsWith('FUSES NOW: '), fusionRoadText(ek[0], ek));
    fuseWeapons(ek, def);
    assert.equal(fusionRoadText(ek[0], ek), '', 'a fused weapon has no further road');
  }
});

s.check('painters: a fused kit maps its body kinds to the fusion', () => {
  assert.equal(fusionByBodyKind([makeWeapon('VOLLEY'), makeWeapon('ORBIT')]), null);
  const kit = [evolved('VOLLEY'), evolved('ORBIT'), evolved('BOOMERANG'), evolved('SEEKER')];
  fuseWeapons(kit, 'ORBITAL_VOLLEY');
  fuseWeapons(kit, 'BLOODHOUND_RANG');
  const m = fusionByBodyKind(kit);
  assert.equal(m.volley.id, 'ORBITAL_VOLLEY');
  assert.equal(m.orbit.id, 'ORBITAL_VOLLEY');
  assert.equal(m.boomerang.id, 'BLOODHOUND_RANG');
  assert.equal(m.seeker.id, 'BLOODHOUND_RANG');
  assert.equal(m.mine, undefined);
});

// ---------------------------------------------------------------- the real loop
const h = await boot();
const T = h.T, st = h.state;
const foe = (x, y, hp) => ({ typeId: 'CHASER', x, y, hp, maxHp: hp, w: 10, h: 10, speed: 0, xp: 1,
  mx: 0, my: 0, age: 0, elite: false });

// A quiet run with a standing pilot and exactly the given EVOLVED weapons
// (plus an evolved Volley when the list has none); `idle` types are parked on
// a long cooldown so only the others fire.
function arena(types, idle = []) {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  T.setPilotMode('MANUAL');
  st.enemies.length = 0; st.gems.length = 0; st.projectiles.length = 0; st.effects.length = 0;
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  const p = st.player;
  p.stats.crit = 0; p.stats.damage = 10; p.stats.pierce = 0; p.stats.projectiles = 1;
  p.mana = p.stats.maxMana = 1e6;
  p.attackTimer = 1e9;   // the volley holds unless a check re-arms it
  p.takenStats = {};     // no stat card: the evolved forms below are set directly
  st.weapons.length = 0;
  st.weaponSlots = 4;
  for (const t of types.includes('VOLLEY') ? types : ['VOLLEY', ...types]) {
    const w = evolved(t);
    w.cd = idle.includes(t) ? 1e9 : 0;
    st.weapons.push(w);
  }
  return p;
}
const keepAlive = () => { st.player.hp = st.player.stats.maxHp; st.player.invuln = 1e9; };
const step = (n = 1) => h.pump(n, keepAlive);
const cardsNow = () => [...h.elements['ov-cards'].children];

// Pump until the forge overlay offers `def`, check its card, and take it.
function fuseThroughOverlay(def) {
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) step();
  assert.equal(st.mode, 'evolve', def.name + ': the offer overlay opened');
  assert.equal(h.elements['ov-title'].textContent, 'FUSION');
  const card = cardsNow().find(c => c._fusionOffer === def.id);
  assert.ok(card, def.name + ': its card is offered');
  assert.ok(card.innerHTML.includes('FUSE: ' + def.name), card.innerHTML);
  assert.ok(card.innerHTML.includes(def.desc), 'the card carries the one-line description');
  assert.ok(/frees a weapon slot/.test(card.innerHTML), 'the card says a slot comes free');
  const slotsBefore = st.weapons.filter(w => w.type !== 'VOLLEY').length;
  card.click();
  assert.equal(st.mode, 'playing');
  const host = st.weapons.find(w => w.fusionId === def.id);
  assert.ok(host && host.type === def.pair[0] && host.fused.type === def.pair[1], def.name + ': fused');
  assert.equal(st.weapons.filter(w => w.type !== 'VOLLEY').length, slotsBefore - 1, def.name + ': one slot freed');
  assert.ok(st.toasts.some(t => t.msg === 'FUSION: ' + def.name.toUpperCase() + ' — ' + def.desc), 'the fusion is announced with what it does');
  return host;
}

s.check('real loop: two max-level weapons that are not evolved are never offered a fusion', () => {
  arena([]);
  for (const t of ['SCYTHE', 'ZAP']) { const w = makeWeapon(t); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9; st.weapons.push(w); }
  step(6);
  assert.equal(st.mode, 'playing');
  assert.equal(T.fusion.offers().length, 0);
});

// Each fusion's behaviour marker: what the fused weapon does that the two
// evolved weapons do not. `setup` returns the probe, `seen` reads it.
const MARKERS = {
  ORBITAL_VOLLEY: {
    idle: [],
    run(p) {
      st.enemies.push(foe(p.x + 90, p.y, 1e9));
      p.attackTimer = 0;
      let shot = null, blades = false;
      for (let i = 0; i < 20 && !shot; i++) {
        step();
        shot = st.projectiles.find(pr => !pr.kind && pr.orbit);
        blades = blades || st.effects.some(f => f.kind === 'orbit');
      }
      assert.ok(shot, 'a volley round is flying its orbit');
      assert.ok(blades, 'the blades still turn (both halves act)');
    },
  },
  SUN_LANE: {
    idle: ['JAVELIN'],
    run(p) {
      st.enemies.push(foe(p.x + 90, p.y, 1e9));
      p.attackTimer = 0;
      let spear = null;
      for (let i = 0; i < 20 && !spear; i++) { step(); spear = st.projectiles.find(pr => pr.kind === 'javelin'); }
      assert.ok(spear, 'the salvo threw a spear while the Javelin itself was parked');
      const full = p.stats.damage * WEAPONS.JAVELIN.DAMAGE_MULT * weaponLevelParams('JAVELIN', WEAPON_MAX_LEVEL).dmgMult *
        EVOLUTION_DEFS.JAVELIN.affixes.damageMult * FUSION_MULT;
      assert.ok(Math.abs(spear.damage / full - 0.5) < 1e-9, 'half a fused spear: ' + spear.damage + ' vs ' + full);
      // the other direction: a real spear throw is flanked by two rounds
      p.attackTimer = 1e9; st.projectiles.length = 0;
      findKitWeapon(st.weapons, 'JAVELIN').cd = 0;
      let rounds = 0;
      for (let i = 0; i < 5 && rounds === 0; i++) { step(); rounds = st.projectiles.filter(pr => !pr.kind).length; }
      assert.equal(rounds, 2, 'two escort rounds');
    },
  },
  SUPERCONDUCTOR: {
    idle: ['ZAP'],
    run(p) {
      const first = foe(p.x + 60, p.y, 1e9), second = foe(p.x + 60, p.y + 50, 1e9);
      st.enemies.push(first, second);
      let bolt = null;
      for (let i = 0; i < 30 && !bolt; i++) { step(); bolt = st.effects.find(f => f.kind === 'zap' && f.fus === 'SUPERCONDUCTOR'); }
      assert.ok(bolt, 'the beam threw a lightning chain while the Zap itself was parked');
      assert.ok(second.hp < 1e9, 'the chain reached an enemy off the beam lane');
    },
  },
  BLOODHOUND_RANG: {
    idle: ['SEEKER'],
    run(p) {
      st.enemies.push(foe(p.x + 70, p.y, 1e9));
      let missile = null;
      for (let i = 0; i < 240 && !missile; i++) { step(); missile = st.projectiles.find(pr => pr.kind === 'seeker'); }
      assert.ok(missile, 'a catch launched a missile while the Seeker itself was parked');
    },
  },
  CHAIN_REACTION: {
    idle: ['MINE'],
    run(p) {
      const mine = { kind: 'mine', x: p.x + 30, y: p.y, age: 0 };
      st.projectiles.push(mine);
      st.enemies.push(foe(p.x + 300, p.y, 1e9));   // far outside the mine's own trigger
      let gone = false;
      for (let i = 0; i < 120 && !gone; i++) { step(); gone = !st.projectiles.includes(mine); }
      assert.ok(gone, 'the pulse set the mine off');
      assert.ok(st.effects.some(f => f.kind === 'mine_blast' && f.fus === 'CHAIN_REACTION'), 'blast drawn in the fusion colours');
    },
  },
  HARVEST_FIRE: {
    idle: ['EMBER'],
    run(p) {
      const victim = foe(p.x + WEAPONS.SCYTHE.RANGE - 5, p.y, 1);
      st.enemies.push(victim);
      let patch = null;
      for (let i = 0; i < 120 && !patch; i++) { step(); patch = st.projectiles.find(pr => pr.kind === 'firepatch'); }
      assert.ok(patch, 'the sweep kill left burning ground while the Ember itself was parked');
      assert.equal(patch.tint, 'fire');
    },
  },
  STORM_BOUNCE: {
    idle: ['ZAP'],
    run(p) {
      const first = foe(p.x + 50, p.y, 1e9), other = foe(p.x + 50, p.y + 80, 1e9);
      st.enemies.push(first, other);
      let bolt = null;
      for (let i = 0; i < 60 && !bolt; i++) { step(); bolt = st.effects.find(f => f.kind === 'zap' && f.fus === 'STORM_BOUNCE'); }
      assert.ok(bolt, 'the ricochet impact threw a spark while the Zap itself was parked');
    },
  },
  CRATER_FIELD: {
    idle: ['MINE'],
    run(p) {
      const mark = foe(p.x + 100, p.y, 1e9);
      st.enemies.push(mark);
      const inMine = { kind: 'mine', x: mark.x + 40, y: mark.y, age: 5 };
      st.projectiles.push(inMine);
      let landed = false;
      for (let i = 0; i < 160 && !landed; i++) { step(); landed = st.effects.some(f => f.meteor); }
      assert.ok(landed, 'a meteor landed');
      assert.ok(!st.projectiles.includes(inMine), 'the mine in the crater went off');
      assert.ok(st.effects.some(f => f.kind === 'mine_blast' && f.fus === 'CRATER_FIELD'), 'in the fusion colours');
    },
  },
  GRAVITY_WELL: {
    idle: [],
    run(p) {
      const e = foe(p.x + 60, p.y, 1e9);
      st.enemies.push(e);
      let d = 60;
      for (let i = 0; i < 120 && d >= 59; i++) { step(); d = Math.hypot(e.x - p.x, e.y - p.y); }
      assert.ok(d < 50, 'the pulse dragged a standing enemy inward (' + d.toFixed(1) + ')');
    },
  },
  THRESHING_STORM: {
    idle: ['ZAP'],
    run(p) {
      st.enemies.push(foe(p.x + WEAPONS.SCYTHE.RANGE - 5, p.y, 1e9), foe(p.x + WEAPONS.SCYTHE.RANGE + 30, p.y, 1e9));
      let bolt = null;
      for (let i = 0; i < 120 && !bolt; i++) { step(); bolt = st.effects.find(f => f.kind === 'zap' && f.fus === 'THRESHING_STORM'); }
      assert.ok(bolt, 'the sweep threw lightning while the Zap itself was parked');
    },
  },
  FIRE_FOCUS: {
    idle: [],
    run(p) {
      const mark = foe(p.x + 120, p.y, 1e9);
      st.enemies.push(mark);
      const laneMine = { kind: 'mine', x: p.x + 60, y: p.y, age: 0 };
      st.projectiles.push(laneMine);
      findKitWeapon(st.weapons, 'MINE').cd = 1e9;
      let fired = false;
      for (let i = 0; i < 240 && !fired; i++) { step(); fired = !st.projectiles.includes(laneMine); }
      assert.ok(fired, 'the beam set off the mine in its lane');
      assert.ok(st.effects.some(f => f.kind === 'mine_blast' && f.fus === 'FIRE_FOCUS') ||
        mark.hp < 1e9, 'and the beam still strikes');
    },
  },
};

for (const def of FUSION_DEFS) {
  s.check('real loop — ' + def.name + ': offered, taken, one slot freed, and it behaves as one weapon', () => {
    const m = MARKERS[def.id];
    assert.ok(m, 'a behaviour marker is defined for ' + def.id);
    const p = arena(def.pair, def.pair);   // both halves parked until the fusion is made
    fuseThroughOverlay(def);
    st.projectiles.length = 0; st.effects.length = 0;
    for (const w of kitWeapons(st.weapons)) w.cd = (m.idle.includes(w.type) || w.type === 'VOLLEY') ? 1e9 : 0;
    m.run(p);
  });
}

s.check('real loop: both halves of a fused weapon hit harder than the same two evolved weapons', () => {
  const dmgOf = (fuse) => {
    const p = arena(['NOVA_PULSE', 'ORBIT'], ['ORBIT']);
    if (fuse) { T.fusion.take(fusionDef('GRAVITY_WELL')); assert.equal(st.weapons.length, 2); }
    else st.fuseDeclined.add('GRAVITY_WELL');
    st.fuseDeclined.add('ORBITAL_VOLLEY');
    const e = foe(p.x + 20, p.y, 1e9);
    st.enemies.push(e);
    for (let i = 0; i < 10 && e.hp === 1e9; i++) { step(); e.x = p.x + 20; e.y = p.y; }
    return (1e9 - e.hp) / p.stats.damage;   // per point of kit damage (a fusion also raises the kit's)
  };
  const plain = dmgOf(false), fused = dmgOf(true);
  assert.ok(plain > 0, 'the plain pulse landed');
  assert.ok(Math.abs(fused / plain - FUSION_MULT) < 1e-6, 'x' + FUSION_MULT + ' on the pulse, on top of the kit-wide gain (' + fused + ' vs ' + plain + ')');
});

s.check('real loop: NOT NOW defers the offer until the next draft pick', () => {
  arena(['SCYTHE', 'ZAP'], ['SCYTHE', 'ZAP']);
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) step();
  assert.equal(st.mode, 'evolve');
  const notNow = cardsNow().find(c => /NOT NOW/.test(c.innerHTML));
  notNow.click();
  step(10);
  assert.equal(st.mode, 'playing', 'the declined offer stays closed');
  assert.equal(st.weapons.some(w => w.fusionId), false);
  st.pendingDrafts = 1; T.openDraft();
  cardsNow()[0].click();
  for (let i = 0; i < 40 && st.mode !== 'evolve'; i++) step();
  assert.equal(st.mode, 'evolve', 'offered again after a pick');
});

s.check('real loop: the freed slot is refilled from the draft by a NEW weapon card', () => {
  arena(['SCYTHE', 'ZAP'], ['SCYTHE', 'ZAP']);
  st.weaponSlots = 3;   // the Volley plus two
  const open = () => { st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft(); return cardsNow().map(c => c._draftOffer); };
  for (let i = 0; i < 10; i++) assert.ok(!open().some(o => o.id.startsWith('wpn_')), 'no NEW card before a fusion');
  st.mode = 'playing';
  fuseThroughOverlay(fusionDef('THRESHING_STORM'));
  let card = null;
  for (let i = 0; i < 60 && !card; i++) card = open().find(o => o.id.startsWith('wpn_'));
  assert.ok(card, 'a NEW weapon card is offered once a slot is free');
  assert.ok(/^NEW: /.test(card.name) && /takes the free slot at Lv \d/.test(card.desc), card.name + ' / ' + card.desc);
  const type = card.id.slice(4);
  assert.ok(!kitWeapons(st.weapons).some(w => w.type === type), 'never a weapon the kit already holds');
  const el = cardsNow().find(c => c._draftOffer === card);
  el.click();
  const joined = st.weapons.find(w => w.type === type);
  assert.ok(joined && joined.level >= 4, 'the new weapon joined part-levelled');
  for (let i = 0; i < 20; i++) assert.ok(!open().some(o => o.id.startsWith('wpn_')), 'the slot is filled: no more NEW cards');
  st.mode = 'playing';
});

s.check('draft card and STATS text: the fusion road is on the weapon card and the field report', () => {
  T.banners.suppressAll();
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.enemies.length = 0;
  st.weapons.length = 0;
  for (const t of ['VOLLEY', 'SCYTHE', 'ZAP']) st.weapons.push(makeWeapon(t));
  st.player.takenStats = {};
  let seen = null;
  for (let i = 0; i < 60 && !seen; i++) {
    st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft();
    seen = cardsNow().find(c => c._draftOffer && c._draftOffer.id === 'lvl_SCYTHE_1');
  }
  assert.ok(seen, 'a Scythe level card was offered');
  assert.equal(seen._draftOffer.fuseText, 'fuses with Chain Zap once both are evolved');
  assert.ok(seen.innerHTML.includes('fuses with Chain Zap once both are evolved'), seen.innerHTML);
  const volley = cardsNow().find(c => c._draftOffer && c._draftOffer.id === 'lvl_VOLLEY_1');
  if (volley) assert.equal(volley._draftOffer.fuseText, '', 'no partner in the kit: no promise on the card');
  st.mode = 'playing';
  T.openStats();
  const html = cardsNow().map(c => c.innerHTML).join('\n');
  assert.ok(html.includes('fuses with Chain Zap or Ember Shot once both are evolved') ||
    html.includes('fuses with Chain Zap once both are evolved'), 'the Scythe line shows its fusion road');
  assert.ok(/fuses with Orbit Blade or Sun Javelin once both are evolved \(not in this kit\)/.test(html), 'the Volley line lists partners the kit lacks');
  assert.ok(!/SYNERGIES/.test(html), 'the synergy panel is gone');
  T.closeStats();
});

s.check('the shelf: a fusion taken is recorded on the profile; PROGRESS shows discovered and silhouettes', () => {
  const prof = T.getProfile();
  prof.banners = {};
  assert.equal(T.fusion.discovered(), 0);
  arena(['SCYTHE', 'ZAP'], ['SCYTHE', 'ZAP']);
  fuseThroughOverlay(fusionDef('THRESHING_STORM'));
  assert.equal(prof.banners['fusion:THRESHING_STORM'], 1);
  assert.equal(T.fusion.discovered(), 1);
  T.fusion.shelf();
  const cells = cardsNow().filter(c => c._fusionShelf);
  assert.equal(cells.length, FUSION_DEFS.length, 'one cell per fusion');
  const known = cells.filter(c => c._fusionShelf.known);
  assert.equal(known.length, 1);
  assert.ok(known[0].innerHTML.includes('Threshing Storm') && known[0].innerHTML.includes('Scythe + Chain Zap'), known[0].innerHTML);
  for (const c of cells.filter(x => !x._fusionShelf.known)) {
    assert.ok(c.innerHTML.includes('? ? ?') && !FUSION_DEFS.some(d => c.innerHTML.includes(d.name)), 'an undiscovered fusion is a silhouette');
    assert.ok(/dim/.test(c.className));
  }
  assert.ok(/1 \/ 11/.test(h.elements['ov-sub'].innerHTML || h.elements['ov-sub'].textContent), 'the count is shown');
});
s.done();
