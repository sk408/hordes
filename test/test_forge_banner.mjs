// polish P6: an evolution taken just as a boss arrives froze the fight for
// 5.5 s the first time: the forge moment (1.5 s), then the first-ever EVOLVED
// banner's hold (2.5 s), then the boss's arrival sting (1.5 s). Where the
// forge moment was staged it has already announced the evolution, so the
// first-ever banner and its hold are left out. An unattended run, which
// stages no moment, keeps the banner and its hold as before.
// Run: node test/test_forge_banner.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { makeWeapon, WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { EVOLUTION_DEFS } from '../src/evolutions.js';

const S = suite('test_forge_banner');
const h = await boot({ storage: [['hordes_onboarded', '1']], stings: true });
const T = h.T, st = h.state;
const freshEvolve = () => { const b = T.getProfile().banners; if (b) delete b.EVOLVE; };
const readyVolley = () => {
  st.spawnTimer = 1e9; st.player.invuln = 1e9;
  st.wave.midAt = st.time + 1e9;
  const w = makeWeapon('VOLLEY'); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9;
  st.weapons.length = 0; st.weapons.push(w);
  st.player.takenStats = { [EVOLUTION_DEFS.VOLLEY.partner]: 1 };
  return w;
};

S.check('taken as a boss arrives, first time ever: the moment, then the sting, about 3.0 s frozen, no EVOLVED hold', () => {
  assert.ok(T.banners.enabled(), 'one-time banners are live here');
  freshEvolve();
  T.auto.on = false;
  T.startRun(); h.pump(3);
  readyVolley();
  st.wave.endsAt = st.time + 0.02;   // the boss comes with the offer
  let took = false, t0 = null, frozen = 0, lastSim = st.time, sawEvolved = false, maxHold = 0, free = null;
  for (let f = 0; f < 900; f++) {
    st.player.invuln = 1e9; st.player.hp = st.player.stats.maxHp;
    h.pump(1);
    const moved = st.time > lastSim + 1e-9; lastSim = st.time;
    if (st.bossBanner && st.bossBanner.verb === 'EVOLVED') sawEvolved = true;
    maxHold = Math.max(maxHold, st.bannerHold || 0);
    if (st.mode === 'evolve' && !took && f > 20) { took = true; t0 = f; h.key('keydown', { key: '1', preventDefault() {} }); }
    if (took && st.mode === 'playing' && !moved) frozen++;
    if (took && f - t0 > 60 && moved && !T.bossSting.live && !T.forge.live && frozen > 0) { free = f; break; }
  }
  assert.ok(took, 'the offer was taken');
  assert.ok(free != null, 'the fight went on');
  assert.ok(st.weapons[0].evolution, 'evolved');
  assert.ok(Math.abs(frozen / 60 - 3.0) < 0.1, 'frozen after the take: ' + (frozen / 60).toFixed(2) + ' s');
  assert.ok(!sawEvolved, 'no EVOLVED banner after the staged moment');
  assert.equal(maxHold, 0, 'no banner hold');
  assert.ok(T.banners.seen('EVOLVE'), 'the first evolution is still recorded as seen');
});

S.check('an unattended run (no moment staged) keeps the first-ever EVOLVED banner and its hold', () => {
  freshEvolve();
  T.setPilotMode('AUTO_ALL');
  T.auto.on = true;
  T.auto.runsInRow = 1;
  T.auto.restart();
  h.pump(2);
  assert.equal(st.unattended, true);
  st.enemies.length = 0;
  st.wave.endsAt = st.time + 1e9;
  const w = readyVolley();
  let n = 0;
  while (!w.evolution && n++ < 600) { st.player.invuln = 1e9; h.pump(1); }
  assert.ok(w.evolution, 'taken by itself');
  assert.equal(T.forge.live, null, 'no moment');
  assert.ok(st.bossBanner && st.bossBanner.verb === 'EVOLVED', 'the EVOLVED banner');
  assert.ok(st.bannerHold > 2, 'and its hold: ' + st.bannerHold);
  T.auto.on = false;
});

// integ4: the same rule for a fusion, and for a moment nobody saw (the tab went hidden).
const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
const quietRun = () => {
  T.setPilotMode('MANUAL');
  T.auto.on = false;
  T.startRun(); h.pump(3);
  st.enemies.length = 0; st.wave.endsAt = st.time + 1e9;
  // The run's quest board is random. A rolled 'fuse a weapon' quest pays a
  // joker when the fusion lands, and its draft opened after the moment on
  // seeds 1, 3 and 11 (the next check then found stale cards). Not measured here.
  st.quests = [];
};
const takeEvolve = () => {
  const w = readyVolley();
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve');
  h.key('keydown', { key: '1', preventDefault() {} });
  assert.ok(w.evolution && T.forge.live, 'taken, the moment is up');
};
const FUSE = 'THRESHING_STORM';
const takeFusion = () => {
  st.spawnTimer = 1e9; st.player.invuln = 1e9; st.wave.midAt = st.time + 1e9;
  st.weapons.length = 0;
  for (const t of ['SCYTHE', 'ZAP']) {
    const w = makeWeapon(t); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9;
    w.evolutionId = EVOLUTION_DEFS[t].id; w.evolution = { ...EVOLUTION_DEFS[t] };
    st.weapons.push(w);
  }
  const v = makeWeapon('VOLLEY'); v.cd = 1e9; st.weapons.unshift(v);
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve');
  const card = [...h.elements['ov-cards'].children].find((c) => c._fusionOffer === FUSE);
  assert.ok(card, 'the fusion is offered');
  card.click();
  assert.ok(T.forge.live && T.forge.live.o.kind === 'fuse', 'the fusion moment is up');
};
const freshFusion = () => { const b = T.getProfile().banners; if (b) delete b['fusion:' + FUSE]; };
const playOut = () => { for (let i = 0; i < 240 && T.forge.live; i++) { st.player.invuln = 1e9; h.pump(1); } };

S.check('a first-ever fusion: the staged moment announces it, no FUSED banner or hold', () => {
  freshFusion(); quietRun();
  takeFusion();
  let sawFused = false, maxHold = 0;
  for (let i = 0; i < 240; i++) {
    st.player.invuln = 1e9; h.pump(1);
    if (st.bossBanner && st.bossBanner.verb === 'FUSED') sawFused = true;
    maxHold = Math.max(maxHold, st.bannerHold || 0);
  }
  assert.equal(T.forge.live, null, 'the moment ran out');
  assert.ok(!sawFused, 'no FUSED banner after the staged moment');
  assert.equal(maxHold, 0, 'no banner hold');
  assert.ok(T.banners.seen('fusion:' + FUSE), 'the fusion is on the shelf');
});

S.check('a first-ever fusion with no moment staged (the tab hidden) keeps the FUSED banner', () => {
  freshFusion(); quietRun();
  st.spawnTimer = 1e9;
  hide(true);
  try {
    st.weapons.length = 0;
    for (const t of ['SCYTHE', 'ZAP']) {
      const w = makeWeapon(t); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9;
      w.evolutionId = EVOLUTION_DEFS[t].id; w.evolution = { ...EVOLUTION_DEFS[t] };
      st.weapons.push(w);
    }
    const v = makeWeapon('VOLLEY'); v.cd = 1e9; st.weapons.unshift(v);
    // Open the offer for real (a frame), not the cards an earlier
    // check left in the overlay.
    h.elements['ov-cards'].innerHTML = '';
    for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
    assert.equal(st.mode, 'evolve', 'the offer opened');
    const card = [...h.elements['ov-cards'].children].find((c) => c._fusionOffer === FUSE);
    assert.ok(card, 'the fusion is offered');
    card.click();
    assert.equal(T.forge.live, null, 'no moment in a hidden tab');
    assert.ok(st.bossBanner && st.bossBanner.verb === 'FUSED', 'the FUSED banner');
    assert.ok(st.bannerHold > 2, 'and its hold');
  } finally { hide(false); }
});

S.check('the tab hidden during a first-ever moment: the moment ends, the EVOLVED banner shows as before', () => {
  freshEvolve(); quietRun();
  takeEvolve();
  h.pump(10);
  assert.ok(T.forge.live, 'still on screen');
  hide(true);
  try {
    assert.equal(T.forge.live, null, 'the moment is over');
    assert.ok(st.bossBanner && st.bossBanner.verb === 'EVOLVED', 'the EVOLVED banner');
    assert.ok(st.bannerHold > 2, 'and its hold');
  } finally { hide(false); }
  h.pump(2);
  assert.ok(st.bossBanner && st.bossBanner.verb === 'EVOLVED', 'seen when the player is back');
});

S.check('the same for a fusion: hidden mid-moment, the FUSED banner shows', () => {
  freshFusion(); quietRun();
  takeFusion();
  h.pump(10);
  hide(true);
  try {
    assert.equal(T.forge.live, null);
    assert.ok(st.bossBanner && st.bossBanner.verb === 'FUSED', 'the FUSED banner');
  } finally { hide(false); }
  playOut();
});

// integ5: a background run (the tab hidden, the pilot playing on) whose first
// evolution ever comes while nobody looks. The banner used to run out on the
// hidden frames. Now the run plays on, and the banner waits for the player.
S.check('a first-ever EVOLVED banner in a background run waits for the player to come back', () => {
  freshEvolve();
  T.setPilotMode('AUTO_ALL'); T.auto.on = false;
  T.startRun(); h.pump(3);
  st.enemies.length = 0; st.wave.endsAt = st.time + 1e9;
  const w = readyVolley();
  let played = 0;
  const away = (s) => { for (let i = 0; i < s * 4; i++) { st.player.invuln = 1e9; h.advanceClock(250); T.bg.tick(performance.now()); } };
  hide(true);
  try {
    assert.equal(T.bg.hidden, true);
    for (let i = 0; i < 60 && !w.evolution; i++) away(0.5);
    assert.ok(w.evolution, 'the pilot took the evolution while hidden');
    assert.equal(T.forge.live, null, 'no moment in a hidden tab');
    const t0 = st.time;
    away(6);
    played = st.time - t0;
  } finally { hide(false); }
  h.pump(1);
  assert.ok(st.bossBanner && st.bossBanner.verb === 'EVOLVED', 'the EVOLVED banner is up when the player is back');
  assert.ok(st.bannerHold > 2.3, 'with its whole hold: ' + st.bannerHold);
  // Not held while hidden: nobody was there to see the hold.
  assert.ok(played > 5.5, 'the run played on while hidden: ' + played.toFixed(2) + ' s of 6');
  const simT = st.time;
  h.pump(60);
  assert.equal(st.time, simT, 'the fight waits under it');
  assert.ok(st.bossBanner && st.bossBanner.verb === 'EVOLVED', 'still up a second later');
  for (let i = 0; i < 120; i++) h.pump(1);
  assert.equal(st.bannerHold, 0, 'then it lets go');
  assert.equal(st.bannerLater, null);
});

S.done();
