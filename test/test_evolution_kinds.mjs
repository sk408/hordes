// The draft route to an evolution, through the real loop: a maxed weapon plus
// its partner card opens the EVOLVE overlay; the draft cards say where the
// weapon stands; the four newer weapons evolve and change behaviour.
// Run: node test/test_evolution_kinds.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { EVOLUTION_DEFS, evolveWeapon } from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL, WEAPON_NAMES, makeWeapon, updateWeapons } from '../src/weapons.js';
import { UPGRADES } from '../src/config.js';

const s = suite('test_evolution_kinds');

s.check('every evolution partner is a common stat card the draft can offer', () => {
  const ids = new Set(UPGRADES.map(u => u.id));
  for (const def of Object.values(EVOLUTION_DEFS)) {
    assert.ok(ids.has(def.partner), def.weapon + ' partner ' + def.partner);
    const w = makeWeapon(def.weapon);
    w.level = WEAPON_MAX_LEVEL;
    assert.equal(evolveWeapon(w, { [def.partner]: 1 }).ok, true, def.weapon);
  }
});

const h = await boot();
const st = h.T.state;
h.T.startRun();
h.pump(2);

function quiet() {
  st.spawnTimer = 1e9;
  st.enemies.length = 0;
  st.projectiles.length = 0;
}

s.check('real loop: a maxed Boomerang plus Whetstone opens the Void Rang evolution', () => {
  quiet();
  let w = st.weapons.find(x => x.type === 'BOOMERANG');
  if (!w) { w = makeWeapon('BOOMERANG'); st.weapons.push(w); }
  for (const x of st.weapons) x.level = x === w ? WEAPON_MAX_LEVEL : 1;
  st.player.takenStats = { dmg: 1 };
  for (let i = 0; i < 5 && st.mode === 'playing'; i++) h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'evolve');
  const cards = h.elements['ov-cards'].children;
  assert.ok(/Void Rang/.test(cards[0].innerHTML), cards[0].innerHTML);
  assert.ok(/Whetstone/.test(cards[0].innerHTML), 'the card names the partner');
  cards[0].click();
  assert.equal(w.evolutionId, 'VOID_RANG');
  assert.equal(st.mode, 'playing');
});

s.check('the same weapon without its partner card never opens the overlay', () => {
  quiet();
  const w = makeWeapon('ORBIT');
  w.level = WEAPON_MAX_LEVEL;
  st.weapons.push(w);
  st.player.takenStats = { dmg: 1 };
  for (let i = 0; i < 5 && st.mode === 'playing'; i++) h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'playing');
  st.weapons.splice(st.weapons.indexOf(w), 1);
});

s.check('draft cards: a weapon level-up says its partner and progress; the completing card is marked', () => {
  quiet();
  const volley = st.weapons.find(x => x.type === 'VOLLEY');
  volley.level = 5;
  st.player.takenStats = {};
  const open = () => { st.pendingDrafts = 1; h.T.openDraft(); return [...h.elements['ov-cards'].children].map(c => c._draftOffer); };
  let seen = null;
  for (let i = 0; i < 40 && !seen; i++) {
    const offs = open();
    seen = offs.find(o => o.id === 'lvl_VOLLEY_5');
    st.mode = 'playing';
  }
  assert.ok(seen, 'a Volley level card was offered');
  assert.ok(/Lv 5\/8/.test(seen.desc), seen.desc);
  assert.ok(/evolves with Split Shot at Lv 8/.test(seen.evoText), seen.evoText);
  assert.equal(seen.evoReady, false);
  // Partner owned and one level short: the level card completes the evolution.
  volley.level = 7;
  st.player.takenStats = { multi: 1 };
  seen = null;
  for (let i = 0; i < 40 && !seen; i++) {
    const offs = open();
    seen = offs.find(o => o.id === 'lvl_VOLLEY_7');
    st.mode = 'playing';
  }
  assert.ok(seen, 'the Lv7 card was offered');
  assert.ok(/EVOLVES NOW: Nova Shot/.test(seen.evoText), seen.evoText);
  assert.equal(seen.evoReady, true);
  // The partner card of a maxed weapon is marked the same way.
  volley.level = 8;
  st.player.takenStats = {};
  seen = null;
  for (let i = 0; i < 60 && !seen; i++) {
    const offs = open();
    seen = offs.find(o => o.id === 'multi');
    st.mode = 'playing';
  }
  assert.ok(seen, 'Split Shot was offered');
  assert.ok(/EVOLVES NOW: Nova Shot/.test(seen.evoText), seen.evoText);
  const el = [...h.elements['ov-cards'].children].find(c => c._draftOffer === seen);
  assert.ok(/EVOLUTION READY/.test(el.innerHTML), 'the card is highlighted');
  assert.equal(seen.evoReady, true);
  volley.level = 1;
  h.elements['overlay'].style.display = 'none';
  st.pendingDrafts = 0;
});

// ---- the four newer evolutions change behaviour (weapons.js, driven directly)
function arena(weaponType, flagsOn) {
  const w = makeWeapon(weaponType);
  w.level = WEAPON_MAX_LEVEL;
  if (flagsOn) evolveWeapon(w, { [EVOLUTION_DEFS[weaponType].partner]: 1 });
  const S = {
    player: { x: 0, y: 0, stats: { damage: 100, cooldown: 0.55, projectiles: 1, pierce: 0 }, buffs: {} },
    enemies: [], projectiles: [], effects: [], healBudget: 1e9,
  };
  return { w, S };
}
const foe = (x, y, hp = 1e6) => ({ x, y, hp, maxHp: hp });

s.check('SOLAR_LANCE: the spear flies past the normal range and bursts at the end', () => {
  for (const evo of [false, true]) {
    const { w, S } = arena('JAVELIN', evo);
    S.enemies.push(foe(400, 0));          // past the base lane (220 + 75), inside 2.5x
    S.enemies.push(foe(420, 20));         // a neighbour for the sun burst
    for (let i = 0; i < 240; i++) updateWeapons(S, [w], 1 / 60);
    const hit = S.enemies[0].hp < 1e6;
    assert.equal(hit, evo, 'evo=' + evo + ' reached the far enemy');
    if (evo) { assert.ok(S.effects.some(e => e.kind === 'nova_pulse' && e.evo === 'sun'), 'sun burst painted'); assert.ok(S.enemies[1].hp < 1e6, 'the sun burst reached the neighbour'); }
  }
});

s.check('INFERNO: a kill burst leaves burning ground that keeps ticking', () => {
  const { w, S } = arena('EMBER', true);
  S.enemies.push(foe(60, 0, 1));         // dies to the first bolt
  S.enemies.push(foe(70, 10));           // stands in the fire
  for (let i = 0; i < 120; i++) updateWeapons(S, [w], 1 / 60);
  assert.ok(S.projectiles.some(p => p.kind === 'firepatch'), 'a fire patch exists');
  const hp0 = S.enemies[1].hp;
  for (let i = 0; i < 60; i++) updateWeapons(S, [w], 1 / 60);
  assert.ok(S.enemies[1].hp < hp0, 'the patch kept burning the bystander');
});

s.check('PRISM_SHOT: an impact throws a second shard', () => {
  const { w, S } = arena('RICOCHET', true);
  S.enemies.push(foe(40, 0), foe(80, 40), foe(80, -40));
  let shards = 0;
  for (let i = 0; i < 90; i++) {
    updateWeapons(S, [w], 1 / 60);
    shards = Math.max(shards, S.projectiles.filter(p => p.kind === 'ricochet' && p.gen === 1).length);
  }
  assert.ok(shards >= 1, 'a gen-1 shard was thrown');
});

s.check('METEOR_STORM: twice the rocks, each on its own target, each leaving a crater', () => {
  const { w, S } = arena('METEOR', true);
  for (let i = 0; i < 8; i++) S.enemies.push(foe(60 + i * 90, (i % 2) * 90));
  for (let i = 0; i < 60; i++) updateWeapons(S, [w], 1 / 60);
  const landings = S.effects.filter(e => e.kind === 'mine_blast' && e.meteor).length;
  assert.equal(landings, 6, 'Lv8 storm: 3 rocks x2');
  assert.equal(S.projectiles.filter(p => p.kind === 'firepatch').length, 6, 'a crater per rock');
});

s.check('weapon names still resolve for the HUD', () => {
  for (const id of Object.keys(EVOLUTION_DEFS)) assert.ok(WEAPON_NAMES[id]);
});

s.done();
