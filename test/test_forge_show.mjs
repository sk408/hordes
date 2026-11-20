// R5 "Evolution staged": the evolve and fusion offer sits over the frozen
// field with pictures (weapon + partner = evolved), and taking it plays a
// short forge moment (src/forge_show.js) before the run goes on.
//   1. the module: lengths, the fuse instant, the still, the card faces, the
//      reward colour.
//   2. every evolution and every fusion has its three pictures.
//   3. the real game: the offer's lighter scrim and picture rows; the take
//      applies the rules at once, holds the sim through the moment, plays the
//      sting at the fuse, then starts the slow time; a repeat is shorter.
//   4. the shared skip rule; a hidden tab ends it; an unattended run has none.
//   5. reduced motion: a still.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import * as FORGE from '../src/forge_show.js';
import * as audio from '../src/audio.js';
import { EVOLUTION_DEFS } from '../src/evolutions.js';
import { FUSION_DEFS, fusionDef } from '../src/fusions.js';
import { makeWeapon, WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { WEAPON_OFFER_TO_DECK } from '../src/draft_card_art.js';
import { CARD_W, CARD_H } from '../src/art/cards.js';
import { draftLayout } from '../src/draft_card_art.js';
import { composeMenuFrame, MENU_FRAME_PALETTES } from '../src/art/menu_frame.js';

Math.random = mulberry32(20261119);
const S = suite('R5 forge moment');

function recorder() {
  const rects = [], texts = [];
  let style = null;
  const g = {
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style, a: g.globalAlpha }); },
    fillText(t) { texts.push(String(t)); },
    beginPath() {}, arc() {}, ellipse() {}, stroke() {},
  };
  return { g, rects, texts };
}
const ART = (deck) => ({ grid: [[1, 2], [2, 1]], palette: { 1: '#000001', 2: '#000002' } });

// ---- 1. the module ---------------------------------------------------------
S.check('the moment: 1.5 s the first time, 0.9 s a repeat, a 1.0 s still; the fuse at 0.75 of 1.5', () => {
  assert.equal(FORGE.durationOf({}), 1.5);
  assert.equal(FORGE.durationOf({ repeat: true }), 0.9);
  assert.equal(FORGE.durationOf({ reduced: true }), 1.0);
  assert.equal(FORGE.durationOf({ reduced: true, repeat: true }), 1.0);
  assert.equal(FORGE.fuseTime({}), 0.75);
  assert.ok(Math.abs(FORGE.fuseTime({ repeat: true }) - 0.45) < 1e-9);
  assert.equal(FORGE.fuseTime({ reduced: true }), 0, 'the still plays its sting at once');
  assert.equal(FORGE.phaseAt(0, {}), 'IN');
  assert.equal(FORGE.phaseAt(0.5, {}), 'CLOSE');
  assert.equal(FORGE.phaseAt(1.0, {}), 'FUSE');
  assert.equal(FORGE.phaseAt(1.4, {}), 'OUT');
  assert.equal(FORGE.phaseAt(1.5, {}), 'DONE');
  assert.ok(!FORGE.isDone(1.49, {}) && FORGE.isDone(1.5, {}));
});

S.check('it draws the two cards, then the new one in cyan-teal with its name; nothing when done', () => {
  const o = { left: ART(), right: ART(), result: ART(), name: 'Nova Shot', sub: 'Volley + Split Shot' };
  const a = recorder();
  FORGE.render(a.g, 0.3, o);
  assert.equal(a.texts.filter(t => t === '+').length, 1, 'weapon + partner');
  assert.ok(!a.texts.includes('NOVA SHOT'), 'the name waits for the fuse');
  const b = recorder();
  FORGE.render(b.g, 1.1, o);
  assert.ok(b.texts.includes('NOVA SHOT') && b.texts.includes('VOLLEY + SPLIT SHOT'), b.texts.join('|'));
  assert.ok(b.rects.some(r => r.style === FORGE.TEAL), 'the reward colour glows');
  assert.ok(![...a.rects, ...b.rects].some(r => /^#ff6a3a$/i.test(r.style)), 'no danger colour in a reward');
  const c = recorder();
  FORGE.render(c.g, 1.5, o);
  assert.equal(c.rects.length + c.texts.length, 0, 'nothing after the end');
});

S.check('reduced motion: one still picture, the same at every instant', () => {
  const o = { left: ART(), right: ART(), result: ART(), name: 'X', reduced: true };
  const a = recorder(), b = recorder();
  FORGE.render(a.g, 0.05, o);
  FORGE.render(b.g, 0.9, o);
  const sig = (r) => r.rects.map(x => [x.style, x.x, x.y, x.w, x.h, x.a].join()).join(';');
  assert.equal(sig(a), sig(b), 'a still');
  assert.ok(a.texts.includes('X'));
  assert.ok(!a.texts.includes('+'), 'the result only');
});

S.check('the card faces: an evolved weapon is its own card with a cyan-teal keyline; a fusion shows its emblem', () => {
  const deck = WEAPON_OFFER_TO_DECK.VOLLEY;
  const evo = FORGE.evolvedFaceArt(deck);
  assert.equal(evo.palette[1], FORGE.TEAL);
  assert.equal(evo.grid.length, CARD_H);
  const def = fusionDef('ORBITAL_VOLLEY');
  const fu = FORGE.fusionFaceArt(def);
  assert.equal(fu.grid.length, CARD_H);
  assert.ok(fu.grid.every(r => r.length === CARD_W));
  assert.equal(fu.palette[1], FORGE.TEAL);
  assert.equal(fu.palette[5], def.tint[0]);
  const cells = fu.grid.flat();
  assert.equal(cells.filter(v => v === 5).length, 9 * def.mark.join('').split('a').length - 9, 'every emblem cell at 3x');
});

// ---- 3. the real game --------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
h.skipMovie();
const kdown = (k, extra = {}) => h.key('keydown', { key: k, preventDefault() {}, ...extra });
const cardsNow = () => [...el['ov-cards'].children];

// Real audio voices on a fake context, to hear the sting.
class Param { constructor(v = 0) { this.value = v; } setValueAtTime(v) { this.value = v; return this; } exponentialRampToValueAtTime() { return this; } linearRampToValueAtTime() { return this; } }
class Node { constructor() { this.gain = new Param(1); } connect(d) { return d; } disconnect() {} }
class Ctx {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = new Node(); }
  createGain() { return new Node(); }
  createWaveShaper() { return new Node(); }
  createBiquadFilter() { const n = new Node(); n.frequency = new Param(); n.Q = new Param(); return n; }
  createOscillator() { const o = new Node(); o.frequency = new Param(440); o.start = () => {}; o.stop = () => {}; return o; }
  createBufferSource() { const n = new Node(); n.start = () => {}; n.stop = () => {}; return n; }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
  resume() { return Promise.resolve(); }
}
const actx = new Ctx();
const mem = new Map();
audio.AUDIO_TEST.setDeps({ AudioContext: function () { return actx; }, storage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, rng: null });
audio.AUDIO_TEST.reset();
audio.init();
const heard = (n) => audio.AUDIO_TEST.sfxPlayedAt(n);

// A quiet run whose Volley is ready to evolve (max level, partner owned).
function readyRun(types = ['VOLLEY']) {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.enemies.length = 0;
  st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  st.player.invuln = 1e9;
  st.weapons.length = 0;
  st.player.takenStats = {};
  for (const t of types) {
    const w = makeWeapon(t); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9;
    st.weapons.push(w);
    st.player.takenStats[EVOLUTION_DEFS[t].partner] = 1;
  }
  actx.currentTime += 5;
}
function openOffer() {
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve');
}

S.check('every evolution and every fusion has its three pictures', () => {
  for (const [type, def] of Object.entries(EVOLUTION_DEFS)) {
    const w = makeWeapon(type);
    const a = T.forge.arts({ kind: 'evolve', w });
    assert.ok(a && a.left && a.right && a.result, type + ': weapon, partner and evolved card');
    assert.equal(a.name, def.name);
  }
  for (const def of FUSION_DEFS) {
    const a = T.forge.arts({ kind: 'fuse', def });
    assert.ok(a && a.left && a.right && a.result, def.id + ': both evolved halves and the fusion');
    assert.equal(a.left.palette[1], FORGE.TEAL, 'the halves are shown evolved');
  }
});

S.check('the offer: a lighter scrim over the field, and each offer shows weapon + partner = evolved', () => {
  readyRun();
  openOffer();
  const ov = el['overlay'];
  assert.ok(ov.classList.contains('forge') && ov.classList.contains('draft'), 'the forge flag on the draft overlay');
  const offer = cardsNow()[0];
  const row = [...offer.children].find(c => c.className === 'forge-row');
  assert.ok(row, 'the picture row');
  assert.equal(row.children.length, 5, 'card + card = card');
  assert.deepEqual(row.children.filter(c => c.className === 'forge-sign').map(c => c.textContent), ['+', '=']);
  assert.equal(row._forgeArts.name, EVOLUTION_DEFS.VOLLEY.name);
  const notNow = cardsNow().find(c => /NOT NOW/.test(c.innerHTML));
  assert.ok(notNow && ![...(notNow.children || [])].some(c => c.className === 'forge-row'), 'NOT NOW has no pictures');
  // NOT NOW and a later draft: the draft keeps its own dark scrim.
  notNow.click();
  assert.ok(!ov.classList.contains('forge'), 'the flag leaves with the offer');
  st.pendingDrafts = 1; T.openDraft();
  assert.ok(!ov.classList.contains('forge') && ov.classList.contains('draft'), 'a draft is not dimmed like the offer');
  cardsNow()[0].click();
});

S.check('the offer and a draft show their heading even when the run began from the pre-run screen', () => {
  T.menus.showPreRun();
  assert.equal(el['ov-title'].style.display, 'none', 'the pre-run screen hides the heading');
  readyRun();
  openOffer();
  assert.notEqual(el['ov-title'].style.display, 'none', 'EVOLUTION is shown');
  assert.equal(el['ov-title'].textContent, 'EVOLUTION');
  cardsNow().find(c => /NOT NOW/.test(c.innerHTML)).click();
  T.menus.showPreRun();
  T.startRun(); h.pump(2);
  st.pendingDrafts = 1; T.openDraft();
  assert.equal(st.mode, 'draft');
  assert.notEqual(el['ov-title'].style.display, 'none', 'the draft heading is shown');
  cardsNow()[0].click();
});

S.check('taking it: the rules at once, the sim held through the moment, the sting at the fuse, then slow time', () => {
  readyRun();
  openOffer();
  const p = st.player;
  p.hp = 1;
  const before = heard('forge');
  kdown('1');
  // The rules are applied and the mode is 'playing' at once.
  assert.equal(st.mode, 'playing');
  assert.ok(st.weapons[0].evolution, 'evolved');
  assert.equal(p.hp, p.stats.maxHp, 'the forge heal');
  assert.ok(st.toasts.some(t => /UNLEASHED/.test(t.msg)));
  const f = T.forge.live;
  assert.ok(f, 'the moment is on screen');
  assert.equal(f.o.repeat, false, 'the first of this run');
  assert.ok(!st.moment, 'the slow time waits for the moment to end');
  const t0 = st.time;
  let frames = 0, stungAt = null;
  while (T.forge.live && frames < 200) {
    actx.currentTime += 1 / 60;
    h.pump(1); frames++;
    if (stungAt == null && heard('forge') !== before) stungAt = frames;
  }
  assert.equal(st.time, t0, 'the field stayed frozen');
  assert.ok(Math.abs(frames / 60 - 1.5) < 0.05, 'about 1.5 s: ' + frames + ' frames');
  assert.ok(stungAt != null && Math.abs(stungAt / 60 - 0.75) < 0.05, 'the sting at the fuse: frame ' + stungAt);
  assert.ok(st.moment && st.moment.kind === 'evolution', 'the earned moment starts as the run goes on');
  h.pump(2);
  assert.ok(st.time > t0, 'the run goes on');
});

S.check('a second one in the same run is shorter (0.9 s); a new run starts long again', () => {
  readyRun(['VOLLEY', 'ORBIT']);
  openOffer();
  kdown('1');
  for (let i = 0; i < 200 && T.forge.live; i++) h.pump(1);
  openOffer();
  kdown('1');
  assert.equal(T.forge.live.o.repeat, true);
  let frames = 0;
  while (T.forge.live && frames < 200) { h.pump(1); frames++; }
  assert.ok(Math.abs(frames / 60 - 0.9) < 0.05, 'about 0.9 s: ' + frames);
  readyRun();
  openOffer();
  kdown('1');
  assert.equal(T.forge.live.o.repeat, false, 'a new run');
  T.forge.end();
});

S.check('a fusion gets the same moment with its two evolved weapons', () => {
  readyRun(['SCYTHE', 'ZAP']);
  for (const w of st.weapons) { w.evolutionId = EVOLUTION_DEFS[w.type].id; w.evolution = { ...EVOLUTION_DEFS[w.type] }; }
  st.weapons.unshift(makeWeapon('VOLLEY'));
  st.weapons[0].cd = 1e9;
  openOffer();
  assert.equal(el['ov-title'].textContent, 'FUSION');
  const card = cardsNow().find(c => c._fusionOffer === 'THRESHING_STORM');
  assert.ok(card, 'the fusion is offered');
  card.click();
  const f = T.forge.live;
  assert.ok(f && f.o.kind === 'fuse' && f.o.name === fusionDef('THRESHING_STORM').name);
  h.rec.on = true; h.rec.texts.length = 0;
  for (let i = 0; i < 70; i++) h.pump(1);
  h.rec.on = false;
  assert.ok(h.rec.texts.some(t => t.txt === 'THRESHING STORM'), 'its name is drawn');
  T.forge.end();
});

// ---- 4. skip, hidden tab, unattended ------------------------------------------
S.check('the shared skip rule: a press in the first 0.4 s is ignored, the first shows SKIP, the second skips', () => {
  readyRun();
  openOffer();
  kdown('1');
  const f = T.forge.live;
  kdown('Escape');
  assert.equal(T.forge.live, f, 'a press in the guard is ignored');
  assert.equal(f.skip.ask, 0);
  for (let i = 0; i < 27; i++) h.pump(1);   // 0.45 s
  const before = heard('forge');
  kdown('a');
  assert.equal(T.forge.live, f, 'any key only shows SKIP');
  assert.ok(f.skip.ask > 0);
  kdown('Escape', { repeat: true });
  assert.equal(T.forge.live, f, 'a held key is not a press');
  kdown('Escape');
  assert.equal(T.forge.live, null, 'skipped');
  assert.notEqual(heard('forge'), before, 'a skip before the fuse still plays the sting');
  assert.ok(st.moment, 'and the run goes on with its slow time');
  T.uiGuard.standDown();
});

S.check('a tap: the first shows SKIP, a tap on SKIP skips', () => {
  readyRun();
  openOffer();
  kdown('1');
  for (let i = 0; i < 27; i++) h.pump(1);
  const tap = (x, y) => el['game']._ev.pointerdown({ clientX: x, clientY: y, pointerType: 'touch', stopPropagation() {}, preventDefault() {} });
  tap(10, 200);
  assert.ok(T.forge.live && T.forge.live.skip.ask > 0, 'the first tap shows SKIP');
  tap(470, 5);   // the SKIP button, top right (view = client in the stub)
  assert.equal(T.forge.live, null, 'the tap on SKIP skips');
  T.uiGuard.standDown();
});

S.check('a hidden tab ends the moment at once and never starts one', () => {
  readyRun();
  openOffer();
  kdown('1');
  assert.ok(T.forge.live);
  const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
  T.setPilotMode('AUTO_ALL');
  hide(true);
  try {
    h.advanceClock(50); T.bg.tick(performance.now());
    assert.equal(T.forge.live, null, 'ended in the hidden tab');
    assert.ok(st.moment, 'what follows it ran');
  } finally { hide(false); }
  // Taken while hidden (the AUTO-PICK countdown): no moment at all.
  st.weapons[0].evolutionId = null; st.weapons[0].evolution = null;
  st.mode = 'playing'; h.pump(1);
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve');
  hide(true);
  try {
    T.fusion.forgeOffers();
    cardsNow()[0].click();
    assert.equal(T.forge.live, null, 'no moment in a hidden tab');
  } finally { hide(false); }
  T.setPilotMode('MANUAL');
});

S.check('an unattended run takes the offer by itself and is not delayed: no moment, today\'s sound', () => {
  T.setPilotMode('AUTO_ALL');
  T.auto.on = true;
  T.auto.runsInRow = 1;
  T.auto.restart();
  h.pump(2);
  assert.equal(st.unattended, true);
  st.spawnTimer = 1e9; st.enemies.length = 0; st.player.invuln = 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.weapons.length = 0;
  const w = makeWeapon('VOLLEY'); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9; st.weapons.push(w);
  st.player.takenStats = { multi: 1 };
  actx.currentTime += 5;
  const evo0 = heard('evolve');
  let n = 0;
  while (!w.evolution && n++ < 600) h.pump(1);
  assert.ok(w.evolution, 'taken by itself');
  assert.equal(T.forge.live, null, 'no moment when nobody watches');
  assert.equal(st.mode, 'playing');
  assert.notEqual(heard('evolve'), evo0, 'the old evolve sound, as before');
  assert.ok(st.moment, 'the slow time at once, as before');
  const t0 = st.time;
  h.pump(1);
  assert.ok(st.time > t0, 'no hold');
  T.auto.on = false;
});

// ---- 4b. review fixes (2026-11-19) --------------------------------------------
// The finished moment's follow-ups: the earned slow time (banners are off here).
const takeFirst = () => { readyRun(['VOLLEY', 'ORBIT']); openOffer(); kdown('1'); assert.ok(T.forge.live); };

S.check('a menu opening mid-moment ends it and runs its follow-ups', () => {
  takeFirst();
  for (let i = 0; i < 10; i++) h.pump(1);
  assert.ok(T.forge.live && !st.moment);
  T.openSettings();
  assert.equal(st.mode, 'settings');
  h.pump(1);
  assert.equal(T.forge.live, null, 'the moment does not ride through the menu');
  assert.ok(st.moment && st.moment.kind === 'evolution', 'its slow time ran');
  T.closeSettings();
  h.pump(1);
  assert.ok(st.mode === 'playing' || st.mode === 'evolve', 'back to the run (the Orbit offer may open): ' + st.mode);
  assert.equal(T.forge.live, null);
});

S.check('no tutorial hint opens over the moment; it opens after', () => {
  takeFirst();
  const H = T.tut.hints;
  H.active = null;
  const hintsWere = T.tut.hintsEnabled();
  T.tut.setHintsEnabled(true);
  const p = st.player;
  st.chests = [{ id: 987654, x: p.x + 30, y: p.y, age: 0 }];
  assert.ok(H.wants('chest'), 'the chest hint is due (else this check proves nothing)');
  for (let i = 0; i < 20; i++) h.pump(1);
  assert.ok(T.forge.live, 'still on screen');
  assert.equal(H.active, null, 'no hint while it is live');
  T.forge.end();
  h.pump(2);
  assert.ok(H.active && H.active.id === 'chest', 'the same chest opens its hint once the moment ends');
  H.active = null;
  st.chests = [];
  T.tut.setHintsEnabled(hintsWere);
});

S.check('a new run during a moment starts without it', () => {
  takeFirst();
  T.startRun();
  assert.equal(T.forge.live, null);
  h.pump(2);
  assert.equal(T.forge.live, null);
});

S.check('a death during the moment drops it: no forge clang, no slow time over the end card', () => {
  takeFirst();
  for (let i = 0; i < 10; i++) h.pump(1);   // before the fuse
  assert.ok(T.forge.live && !st.moment);
  const clang0 = heard('forge');
  st.secondWindUsed = true;
  st.player.invuln = 0;
  T.die();
  assert.equal(T.forge.live, null, 'the moment goes with the death');
  for (let i = 0; i < 900 && st.mode !== 'dead'; i++) { actx.currentTime += 1 / 60; h.pump(1); }
  assert.equal(st.mode, 'dead', 'the end card is up');
  h.pump(3);
  assert.equal(heard('forge'), clang0, 'no forge clang after the death');
  assert.ok(!st.moment, 'no earned slow time while dead');
  assert.ok(!st.bannerHold, 'no banner hold while dead');
});

S.check('toasts age on the wall clock under the moment', () => {
  takeFirst();
  const t = st.toasts.find(x => /UNLEASHED/.test(x.msg));
  assert.ok(t, 'the take toast');
  const ttl0 = t.ttl;
  for (let i = 0; i < 30; i++) h.pump(1);
  assert.ok(T.forge.live, 'still on screen');
  assert.ok(ttl0 - t.ttl > 0.4, 'aged about 0.5 s: ' + (ttl0 - t.ttl).toFixed(3));
  T.forge.end();
});

S.check('a second take while the first is on screen ends the first with its follow-ups', () => {
  takeFirst();
  assert.ok(!st.moment);
  const orbit = st.weapons.find(w => w.type === 'ORBIT');
  T.dev.takeEvolution(orbit);
  assert.ok(orbit.evolution, 'the second is taken');
  assert.ok(T.forge.live && T.forge.live.o.name === EVOLUTION_DEFS.ORBIT.name, 'the second is on screen');
  assert.ok(st.moment && st.moment.kind === 'evolution', 'the first one\'s slow time ran');
  T.forge.end();
});

S.check('touch pads are veiled during the moment, and a pad tap counts as a skip press', () => {
  takeFirst();
  for (let i = 0; i < 27; i++) h.pump(1);   // past the 0.4 s guard
  const layer = el['touch'];
  assert.equal(layer.style.visibility, 'hidden', 'the pads step down (their room is kept)');
  const focus0 = st.focus, pilot0 = st.pilotMode;
  const btn = { dataset: { act: 'focus' } };
  const target = { closest: (sel) => (sel === '[data-act]' ? btn : null) };
  layer._ev.pointerdown({ target, pointerType: 'touch', pointerId: 7, preventDefault() {}, stopPropagation() {} });
  assert.equal(st.focus, focus0, 'the focus did not change under the moment');
  assert.equal(st.pilotMode, pilot0);
  assert.ok(T.forge.live && T.forge.live.skip.ask > 0, 'the tap showed SKIP, like a key');
  T.forge.end();
  h.pump(1);
  assert.equal(layer.style.visibility, '', 'the pads come back');
});

S.check('the offer row fits a phone card: whole scale, inside the card\'s border', () => {
  const R = T.forge.FORGE_ROW;
  const width = (f) => f.only ? R.ART_W * f.s : 3 * R.ART_W * f.s + 2 * (f.tight ? R.SIGN_W_TIGHT : R.SIGN_W) +
    4 * (f.tight ? R.GAP_TIGHT : R.GAP);
  for (const [vw, vh] of [[320, 640], [360, 780], [390, 844], [430, 932], [600, 900], [844, 390], [667, 375], [740, 360]]) {
    for (let n = 2; n <= 4; n++) {
      const lay = draftLayout(vw, vh, n);
      const f = T.forge.rowFit(lay);
      assert.ok(Number.isInteger(f.s) && f.s >= 1, 'a whole scale');
      if (!lay.cardW) continue;
      assert.ok(width(f) <= f.inner + (f.tight ? 2 * R.OVERHANG : 0),
        vw + 'x' + vh + ' n=' + n + ': row ' + width(f) + ' in ' + f.inner);
    }
  }
  const phone = T.forge.rowFit(draftLayout(390, 844, 2));
  assert.equal(phone.s, 2, 'a phone keeps 2x pictures');
  assert.equal(T.forge.rowFit(draftLayout(1280, 720, 2)).s, 3, 'a wide screen keeps 3x');
});

S.check('a new menu frame size is painted as one pixel block, not a fillRect per cell', () => {
  const ctx2d = () => {
    const calls = { fillRect: 0, put: 0, draw: 0, img: null };
    let fs = '';
    const g = {
      set fillStyle(v) { fs = v; }, get fillStyle() { return fs; },
      clearRect() {}, fillRect() { calls.fillRect++; },
      getImageData() {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fs);
        return { data: m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255] : [6, 4, 2, 140] };
      },
      createImageData(w, hh) { return { width: w, height: hh, data: new Uint8ClampedArray(w * hh * 4) }; },
      putImageData(img) { calls.put++; calls.img = img; },
      drawImage() { calls.draw++; },
    };
    return { calls, g };
  };
  const off = ctx2d(), card = ctx2d();
  const realCreate = document.createElement;
  document.createElement = (tag) => (tag === 'canvas' ? { width: 0, height: 0, style: {}, getContext: () => off.g } : realCreate(tag));
  try {
    assert.ok(T.forge.frameBlit({ width: 0, height: 0, getContext: () => card.g }, 313, 247, 'hot'));
  } finally { document.createElement = realCreate; }
  assert.ok(off.calls.fillRect <= 12, 'only the palette is painted cell by cell: ' + off.calls.fillRect + ' fillRects');
  assert.equal(off.calls.put, 1, 'one pixel block');
  assert.equal(card.calls.draw, 1, 'the card copies the atlas');
  // Every pixel is its grid cell's palette colour.
  const { grid } = composeMenuFrame(313, 247);
  const img = off.calls.img, d = img.data;
  assert.equal(img.width, grid[0].length);
  assert.equal(img.height, grid.length);
  const pal = MENU_FRAME_PALETTES.hot;
  let checked = 0;
  for (let y = 0; y < grid.length; y += 7) {
    for (let x = 0; x < grid[y].length; x += 5) {
      const v = grid[y][x], i = (y * img.width + x) * 4;
      if (!v) { assert.equal(d[i + 3], 0, 'empty cell stays clear'); continue; }
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(pal[v]);
      const want = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255] : [6, 4, 2, 140];
      assert.deepEqual([d[i], d[i + 1], d[i + 2], d[i + 3]], want, 'cell ' + x + ',' + y + ' (' + v + ')');
      checked++;
    }
  }
  assert.ok(checked > 500, 'checked ' + checked);
});

// ---- 5. reduced motion ----------------------------------------------------------
S.check('reduced motion: the moment is a still of 1.0 s', () => {
  const mm = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(String(q)), addEventListener() {}, addListener() {} });
  try {
    readyRun();
    openOffer();
    kdown('1');
    assert.equal(T.forge.live.o.reduced, true);
    let frames = 0;
    while (T.forge.live && frames < 200) { h.pump(1); frames++; }
    assert.ok(Math.abs(frames / 60 - 1.0) < 0.05, 'about 1 s: ' + frames);
  } finally { globalThis.window.matchMedia = mm; }
});

// polish P5: on a screen held upright the offer's header lines stand over the
// canvas HUD rows. There the frozen field is drawn without the HUD; a wide
// screen keeps it.
S.check('the offer on an upright screen draws the field without the HUD; a wide screen keeps it', () => {
  const w = globalThis.window, iw = w.innerWidth, ih = w.innerHeight;
  try {
    readyRun();
    openOffer();
    h.pump(1);
    assert.ok(T.renderer.hudDrawn && T.renderer.hudChrome, 'a wide screen: the HUD under the offer');
    w.innerWidth = 390; w.innerHeight = 844;
    h.pump(1);
    assert.equal(st.mode, 'evolve');
    assert.ok(!T.renderer.hudDrawn && !T.renderer.hudChrome, 'upright: no HUD rows under the offer');
    const notNow = cardsNow().find(c => /NOT NOW/.test(c.innerHTML));
    notNow.click();
    h.pump(1);
    assert.equal(st.mode, 'playing');
    assert.ok(T.renderer.hudDrawn && T.renderer.hudChrome, 'upright, back in play: the HUD is back');
  } finally { w.innerWidth = iw; w.innerHeight = ih; h.pump(1); }
});

audio.AUDIO_TEST.reset();   // drop the fake so nothing keeps a timer
S.done();
