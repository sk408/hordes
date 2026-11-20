// R7: the boss arrival sting. When a wave's boss arrives, about 1.5 s on the
// live battlefield: film bars, a push toward the boss, a name card with its
// sprite, its name and its rule. The Maw's arrival is 3.5 s. The sim is held
// for its length, so nothing in the run changes because of it.
//   1. the module: timeline, bars, push, the card's lines and colours, the
//      reduced-motion still, the push copies the drawn world only.
//   2. the real game: a wave-2 arrival holds the sim, shows the boss and its
//      rule, stands in for the banner, steps the HUD down, veils the pads, then
//      the fight goes on with the rule plate and the boss bar; the skip rule;
//      a repeat is shorter; a double wave gets one sting with both; the herald
//      gets none; the Maw; a draft waits; a hidden tab and an unattended run;
//      reduced motion; a death after an arrival still films its killer.
//   3. the same seed with the sting on and off: the same run.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { bossLook } from '../src/movie_cast.js';
import { BOSS_ORDER, BOSSES } from '../src/bosses.js';
import { FINAL_BOSS, FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import * as STING from '../src/boss_sting.js';
import { letterboxAlpha } from '../src/render.js';
import { makeWeapon, WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { EVOLUTION_DEFS } from '../src/evolutions.js';
import { FLASH_DROP } from '../src/loot.js';
import * as audio from '../src/audio.js';
import { SFX, MIX } from '../src/audio.js';

Math.random = mulberry32(20261119);
const S = suite('R7 boss arrival sting');

function recorder() {
  const rects = [], texts = [], images = [];
  let style = null;
  const canvas = { width: 960, height: 600 };
  const g = {
    canvas,
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style, a: g.globalAlpha }); },
    fillText(t, x, y) { texts.push({ t: String(t), style, x, y, font: g.font }); },
    save() {}, restore() {}, translate() {}, scale() {},
    drawImage(...a) { images.push(a); },
  };
  return { g, rects, texts, images };
}
const look = (id) => ({ ...bossLook(id) });
const maw = { id: 'MAW', name: FINAL_BOSS.name, frames: FINAL_BOSS_SPRITE.frames, palette: FINAL_BOSS_SPRITE.palette, box: FINAL_BOSS_SPRITE.box };
const RULE = { text: 'THE SILENCE: skills are sealed', reward: 'win a free card' };

// ---- 1. the module ---------------------------------------------------------------
S.check('the timeline: 1.5 s, a repeat 1.0 s, the Maw 3.5 s, reduced motion a 1.0 s still', () => {
  assert.equal(STING.durationOf({}), 1.5);
  assert.equal(STING.durationOf({ repeat: true }), 1.0);
  assert.equal(STING.durationOf({ kind: 'maw' }), 3.5);
  assert.equal(STING.durationOf({ kind: 'maw', repeat: true }), 3.5, 'the Maw comes once a run: no short form');
  assert.equal(STING.durationOf({ reduced: true }), 1.0);
  assert.equal(STING.durationOf({ kind: 'maw', reduced: true }), 1.0);
  assert.ok(STING.slamTime({}) > 0.2 && STING.slamTime({}) < 0.5);
  assert.ok(STING.slamTime({ repeat: true }) < STING.slamTime({}), 'a repeat lands sooner');
  assert.equal(STING.slamTime({ kind: 'maw' }), STING.MAW_SLAM_AT);
  assert.equal(STING.phaseAt(0.1, {}), 'IN');
  assert.equal(STING.phaseAt(0.8, {}), 'HOLD');
  assert.equal(STING.phaseAt(1.4, {}), 'OUT');
  assert.equal(STING.phaseAt(1.5, {}), 'DONE');
  assert.equal(STING.phaseAt(0.5, { kind: 'maw' }), 'DARK');
  assert.equal(STING.phaseAt(1.2, { kind: 'maw' }), 'RISE');
  // Bars: in, held, out; the Maw's are taller.
  assert.equal(STING.barsAt(0, {}), 0);
  assert.equal(STING.barsAt(0.7, {}), 1);
  assert.equal(STING.barsAt(1.5, {}), 0);
  assert.equal(STING.barsAt(0.01, { reduced: true }), 1, 'reduced motion: the bars stand still');
  assert.ok(STING.barHeight({ kind: 'maw' }) > STING.barHeight({}));
});

S.check('the push: in toward the boss and back; drawing only; none under reduced motion', () => {
  assert.equal(STING.pushAt(0, {}), 0);
  assert.ok(STING.pushAt(0.7, {}) > 0.99);
  assert.equal(STING.pushAt(1.5, {}), 0);
  assert.equal(STING.pushAt(0.7, { reduced: true }), 0);
  const o = { focus: { x: 420, y: 60 } };
  const r = STING.pushRect(0.7, o);
  assert.ok(Math.abs(r.zoom - (1 + STING.PUSH)) < 1e-9);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 480 + 1e-9 && r.sy + r.sh <= 300 + 1e-9, 'never leaves the view');
  assert.ok(r.sx + r.sw / 2 > 240 && r.sy + r.sh / 2 < 150, 'it leans toward the boss');
  const far = STING.pushRect(0.7, { focus: { x: 5000, y: -900 } });
  assert.ok(far.sx + far.sw <= 480 + 1e-9 && far.sy >= 0, 'a boss off screen: it leans to the edge and stays inside');
  assert.ok(STING.pushRect(2.0, { kind: 'maw' }).zoom > STING.pushRect(0.7, {}).zoom, 'the Maw pushes further');
  const k = recorder();
  assert.equal(STING.renderPush(k.g, 0.7, o), true);
  assert.equal(k.images.length, 1);
  const [src, sx, sy, sw, sh, dx, dy, dw, dh] = k.images[0];
  assert.equal(src, k.g.canvas, 'it copies the canvas onto itself');
  assert.deepEqual([dx, dy, dw, dh], [0, 0, 480, 300]);
  assert.ok(Math.abs(sw - r.sw * 2) < 1e-6 && Math.abs(sx - r.sx * 2) < 1e-6 && sh > 0 && sy >= 0, 'in device px');
  const none = recorder();
  assert.equal(STING.renderPush(none.g, 0.7, { reduced: true }), false);
  assert.equal(STING.renderPush(none.g, 0, {}), false);
  assert.equal(none.images.length, 0);
});

S.check('the card: the sprite large, the name in red-orange, the rule in grey and its reward in cyan-teal', () => {
  const o = { cast: [look('PYRAXIS')], rule: RULE, wave: 4, capScale: 1 };
  const k = recorder();
  STING.render(k.g, 0.9, o);
  const name = k.texts.find(t => t.t === BOSSES.PYRAXIS.name.toUpperCase() && t.style === STING.DANGER);
  assert.ok(name, 'the name in the danger colour: ' + JSON.stringify(k.texts.map(t => t.t)));
  assert.ok(k.texts.some(t => t.t === RULE.text.toUpperCase() && t.style === '#e4e4ee'), 'the rule in one line');
  assert.ok(k.texts.some(t => t.t === RULE.reward.toUpperCase() && t.style === STING.TEAL), 'its reward in the reward colour');
  assert.ok(k.texts.some(t => t.t === 'WAVE 4 BOSS'));
  assert.ok(!k.texts.some(t => t.style === '#fff1d6') && !k.rects.some(r => r.style === '#fff1d6'), 'warm white is the hero\'s: never on the card');
  // The sprite: its own colours, painted large (a boss is 24 to 26 px; at 4x it is about 100).
  const pal = new Set(Object.values(look('PYRAXIS').palette));
  const cells = k.rects.filter(r => pal.has(r.style));
  assert.ok(cells.length > 20, 'the boss is drawn in its own colours: ' + cells.length);
  const top = Math.min(...cells.map(r => r.y)), bottom = Math.max(...cells.map(r => r.y + r.h));
  assert.ok(bottom - top >= 80, 'large: ' + (bottom - top) + ' px tall');
  // No rule (wave 1): the boss's flavour line.
  const f = recorder();
  STING.render(f.g, 0.9, { cast: [look('GRAVELMAW')], rule: null, flavor: BOSSES.GRAVELMAW.flavor, wave: 1 });
  assert.ok(f.texts.some(t => t.t === BOSSES.GRAVELMAW.flavor.toUpperCase()));
  // Before it lands the name is not up yet; the bars come in first.
  const early = recorder();
  STING.render(early.g, 0.05, o);
  assert.ok(!early.texts.some(t => t.t === name.t), 'the name lands with the boss');
  const after = recorder();
  STING.render(after.g, 1.5, o);
  assert.equal(after.rects.length + after.texts.length, 0, 'nothing after the end');
});

S.check('every boss, every pair and the Maw fit the card on a desktop and on an upright phone', () => {
  const casts = [...BOSS_ORDER.map(id => [look(id)]), ...BOSS_ORDER.map((id, i) => [look(id), look(BOSS_ORDER[(i + 1) % BOSS_ORDER.length])])];
  for (const cs of [2.6667, 1, 0.8125]) {
    for (const cast of casts) {
      for (const rule of [RULE, null]) {
        const lay = STING.cardLayout({ cast, rule, wave: 9, capScale: cs, flavor: cast.length === 1 ? 'A star that forgot how to die.' : '' });
        for (const l of lay.lines) {
          const w = l.txt.length * l.px * 0.6021;
          assert.ok(l.x + w <= 480 - 8, `${cast.map(c => c.id)} at ${cs}: "${l.txt}" runs off (${l.x + w})`);
          if (l.role !== 'name') assert.ok(l.px * cs >= 11 - 1e-9 && l.px >= 10, 'small text readable: ' + l.px + ' at ' + cs);
        }
        assert.ok(lay.plate.y >= STING.BAR + 4, 'the card clears the top bar: ' + lay.plate.y);
        assert.ok(lay.plate.y + lay.plate.h <= 300 - STING.BAR, 'and the bottom bar');
        const names = lay.lines.filter(l => l.role === 'name').map(l => l.txt).join(' ');
        for (const c of cast) assert.ok(names.includes(c.name.toUpperCase()), 'both names on a double: ' + names);
        assert.equal(lay.sprites.length, cast.length, 'both sprites on a double');
      }
    }
    const m = STING.cardLayout({ kind: 'maw', cast: [maw], flavor: FINAL_BOSS.flavor, capScale: cs });
    for (const l of m.lines) assert.ok(l.x + l.txt.length * l.px * 0.6021 <= 480 - 8, 'the Maw at ' + cs + ': ' + l.txt);
    assert.ok(m.lines.some(l => l.role === 'kicker' && l.txt === 'THE FINALE'));
  }
});

S.check('the card is a strip at the edge of the view: it keeps clear of the hero, and it comes in from off the view', () => {
  const casts = [[look('CHOIR_MOTHER')], [look('GRAVELMAW'), look('PYRAXIS')]];
  for (const cs of [2.6667, 1, 0.8125]) {
    const os = [...casts.map(cast => ({ cast, rule: RULE, wave: 6, capScale: cs })), { kind: 'maw', cast: [maw], flavor: FINAL_BOSS.flavor, capScale: cs }];
    for (const o of os) {
      const tag = o.cast.map(c => c.id).join('+') + ' at ' + cs;
      const b = STING.cardBounds(o);
      // The hero in the middle of the view: the card stands below it, on the bottom bar.
      assert.ok(b.y >= 150 + 12, tag + ': the card leaves the middle to the hero (top ' + b.y + ')');
      const lay = STING.cardLayout(o);
      assert.equal(lay.plate.y + lay.plate.h, 300 - STING.barHeight(o), tag + ': it sits on the bottom bar');
      // The hero low in the view (the camera leads, or a wall stops it): the card goes up, under the HUD's top rows.
      const hero = { x: 240, y: 215, r: 10 };
      const o2 = { ...o, topY: 64 };
      assert.equal(STING.cardSlot(o2, hero), 'top', tag + ': a hero low in the view sends the card up');
      const bt = STING.cardBounds({ ...o2, slot: 'top' });
      assert.ok(bt.y >= 64 && bt.y + bt.h <= hero.y - hero.r, tag + ': clear of it there ' + JSON.stringify(bt));
      assert.equal(STING.cardSlot(o2, { x: 240, y: 150, r: 10 }), 'bottom', tag + ': a hero in the middle keeps it down');
    }
  }
  // The push moves the hero on screen: the slot looks at the push's peak too.
  const o = { cast: [look('CHOIR_MOTHER')], rule: RULE, wave: 2, capScale: 1, topY: 24, focus: { x: 240, y: 20 } };
  const top = STING.cardBounds(o).y;
  const r = STING.pushRect(0.8, o);
  const y = top - 14;   // clear as drawn, under the card at the peak (the push leans up, the hero goes down)
  assert.ok((y - r.sy) * r.zoom + 10 > top, 'the setup: at the peak the hero is under the card');
  assert.equal(STING.cardSlot(o, { x: 240, y, r: 10 }), 'top');
  // It comes in from off the view: no empty plate over the field in the first frames.
  const one = { cast: [look('CHOIR_MOTHER')], rule: RULE, wave: 2, capScale: 1 };
  assert.equal(STING.cardRect(0.017, one), null, 'nothing of the plate at the start');
  const k = recorder();
  STING.render(k.g, 0.017, one);
  assert.ok(!k.rects.some(q => q.style === '#0b0709' && q.x + q.w > 0), 'no plate drawn in the view yet');
  // While it slides in it carries its kicker: never an empty black plate.
  const inn = recorder();
  STING.render(inn.g, 0.17, one);
  assert.ok(STING.cardRect(0.17, one), 'the plate is coming in');
  assert.ok(inn.texts.some(q => q.t.includes('WAVE 2 BOSS')), 'its kicker rides in on it: ' + JSON.stringify(inn.texts.map(q => q.t)));
  const mid = STING.cardRect(0.9, one);
  assert.deepEqual(mid, { ...STING.cardLayout(one).plate }, 'at rest the hole is the plate');
});

S.check('reduced motion: one still card, no push, no flash; the Maw: a silhouette that rises, then its colours', () => {
  const o = { cast: [look('CHOIR_MOTHER')], rule: RULE, wave: 2, reduced: true };
  const a = recorder(), b = recorder();
  STING.render(a.g, 0.05, o);
  STING.render(b.g, 0.8, o);
  const sig = (k) => k.rects.map(r => [r.style, r.x, r.y, r.w, r.h, r.a].join()).join('|') + k.texts.map(t => t.t).join('|');
  assert.equal(sig(a), sig(b), 'a still card');
  assert.ok(a.texts.some(t => t.t === 'THE CHOIR MOTHER'), 'the name is there at once');
  assert.ok(!a.rects.some(r => r.style === STING.DANGER && r.w === 480 && r.h === 300), 'no red-orange flash');
  const pal = new Set(Object.values(FINAL_BOSS_SPRITE.palette));
  const rise = recorder(), shown = recorder();
  STING.render(rise.g, 1.3, { kind: 'maw', cast: [maw] });
  STING.render(shown.g, 2.0, { kind: 'maw', cast: [maw] });
  assert.ok(!rise.rects.some(r => pal.has(r.style) && r.style !== '#170709'), 'a silhouette while it rises');
  assert.ok(rise.rects.some(r => r.style === '#170709'));
  assert.ok(shown.rects.filter(r => pal.has(r.style)).length > 20, 'its colours once it lands');
  assert.ok(shown.texts.some(t => t.t === FINAL_BOSS.name.toUpperCase()));
});

S.check('the sound: a sting cue per arrival and a heavier one for the Maw; no noise voice, no variation, a MIX trim', () => {
  for (const n of ['bossSting', 'mawSting']) {
    const d = SFX[n];
    assert.ok(d && d.voice === 'seq' && d.layers.length >= 4, n);
    assert.ok(!d.layers.some(l => l.v === 'noise'), n + ': no noise voice (it draws from Math.random)');
    assert.ok(!(n in MIX.vary), n + ': no per-play variation');
    assert.ok(n in MIX.trimDb, n + ': a MIX trim');
  }
  const len = (d) => Math.max(...d.layers.map(l => (l.at || 0) + l.dur));
  assert.ok(len(SFX.mawSting) > len(SFX.bossSting), 'the Maw\'s is longer');
});

// ---- 2. the real game --------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']], stings: true });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const SG = T.bossSting;
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const tap = (x, y) => el['game']._ev.pointerdown({ clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} });
function frame(fn) { h.rec.on = true; h.rec.texts.length = 0; h.rec.rects.length = 0; h.pump(1); h.rec.on = false; return fn ? fn(h.rec) : h.rec.texts.map(t => t.txt); }

// Real audio voices on a fake context, to hear the cue.
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

h.skipMovie();   // the intro
function startRunAs(wave) {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9;
  st.wave.num = wave;
  T.bossRules.setWave(wave);   // the wave's rule, as the wave's start sets it
  st.wave.endsAt = st.time + 1e9;
  st.player.invuln = 1e6;
}
// Let the wave run out: the boss cast arrives through the real path.
function arrive() {
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 600) h.pump(1);
  st.wave.endsAt = st.time + 1e9;
  return st.wave.bosses.slice();
}
// Pump until the sting is over; the frames it took.
function playOut(max = 400) {
  let n = 0;
  while (SG.live && n++ < max) h.pump(1);
  return n;
}

S.check('wave 2: the boss arrives, the sim holds, the card shows the boss and its rule in place of the banner', () => {
  startRunAs(2);
  const cast = arrive();
  assert.equal(cast.length, 1);
  const s = SG.live;
  assert.ok(s && s.kind === 'boss', 'the sting is up');
  assert.equal(s.o.cast[0].id, cast[0].bossId, 'the boss this wave really spawned');
  assert.ok(st.bossRule && st.bossRule.live, 'wave 2 brings a rule');
  assert.deepEqual(s.o.rule, { text: st.bossRule.text, reward: st.bossRule.reward }, 'the card names it');
  // The sim is held: nothing moves, nobody is hurt.
  const t0 = st.time, bx = cast[0].x, hp = st.player.hp, n = st.enemies.length;
  st.player.invuln = 0;
  h.pump(32);
  assert.equal(st.time, t0, 'the sim clock waits');
  assert.equal(cast[0].x, bx, 'the boss waits');
  assert.equal(st.player.hp, hp);
  assert.equal(st.enemies.length, n);
  // On screen: the card, not the banner; the pads veiled; the vitals stepped down.
  const tx = frame();
  assert.ok(tx.includes(cast[0].name.toUpperCase()), 'the name card: ' + tx.join('|'));
  assert.ok(tx.includes(st.bossRule.text.toUpperCase()), 'the rule line');
  assert.ok(!tx.includes('APPROACHES'), 'the banner does not shout over it');
  assert.equal(T.renderer.bossBanner, null, 'the banner is not drawn');
  assert.ok(st.bossBanner && st.bossBanner.underSting, 'the banner the card stands in for');
  assert.ok(st.barHudDrop >= STING.BAR - 8, 'the vitals step below the bar: ' + st.barHudDrop);
  assert.equal(T.chromeOn(), false, 'the pads, cog and ? step down');
  // It ends by itself after about 1.5 s; the fight goes on with the plate and the bar.
  const frames = 33 + playOut();
  assert.ok(frames >= 86 && frames <= 94, 'about 1.5 s: ' + frames + ' frames');
  assert.equal(st.bossBanner, null, 'the banner went with it');
  assert.ok(heard('bossSting') !== undefined, 'the sting cue played');
  assert.equal(T.chromeOn(), true);
  h.pump(2);
  assert.ok(st.time > t0, 'the fight goes on');
  st.player.invuln = 1e6;
  h.rec.on = true; h.rec.texts.length = 0; h.pump(1); h.rec.on = false;
  assert.ok(T.renderer.hudChrome && st.bossRule.live, 'the HUD and the rule are back');
  assert.ok(h.rec.texts.some(t => t.txt.includes(st.bossRule.name)), 'the rule plate is drawn: ' + h.rec.texts.map(t => t.txt).join('|').slice(0, 300));
  assert.equal(st.barHudDrop, 0);
});

S.check('a repeat of the same boss in the run is shorter; a double wave gets one sting with both; the herald gets none', () => {
  // The same run, the same boss again.
  // (The cast is cleared away and the wave's boss called again through the real spawnBoss.)
  for (const b of st.wave.bosses) { const i = st.enemies.indexOf(b); if (i >= 0) st.enemies.splice(i, 1); }
  st.wave.bosses = [];
  T.bossRules.spawnBoss();
  const again = st.wave.bosses.slice();
  assert.ok(SG.live && SG.live.o.repeat, 'a repeat');
  assert.equal(SG.live.o.cast[0].id, again[0].bossId);
  const frames = playOut();
  assert.ok(frames >= 56 && frames <= 64, 'about 1.0 s: ' + frames);
  // A double wave.
  startRunAs(3);
  const two = arrive();
  assert.equal(two.length, 2);
  const s = SG.live;
  assert.ok(s, 'one sting');
  assert.deepEqual(s.o.cast.map(c => c.id), two.map(b => b.bossId), 'both bosses on it');
  assert.equal(s.o.repeat, false, 'a new run: not a repeat');
  const tx = (h.pump(40), frame());
  for (const b of two) assert.ok(tx.some(t => t.includes(b.name.toUpperCase())), 'both names: ' + tx.join('|'));
  playOut();
  // The herald (a mid-wave boss): no sting.
  startRunAs(4);
  st.wave.midBossDone = false; st.wave.midAt = st.time;
  let g = 0;
  while (!(st.wave.midBosses || []).length && g++ < 120) h.pump(1);
  assert.ok((st.wave.midBosses || []).length, 'the herald came');
  assert.equal(SG.live, null, 'no sting for the herald');
});

S.check('the skip rule: a press in the first moments is ignored, the first shows SKIP, the second skips; a tap too', () => {
  startRunAs(5);
  arrive();
  assert.ok(SG.live);
  kdown('Escape');
  assert.equal(SG.live.skip.ask, 0, 'too soon');
  h.pump(30);
  kdown('a');
  assert.ok(SG.live && SG.live.skip.ask > 0, 'any key shows SKIP (and does not steer)');
  assert.equal(st.mode, 'playing', 'ESC under the sting does not pause');
  assert.ok(frame().includes('SKIP'));
  kdown('Escape');
  assert.equal(SG.live, null, 'the second press skips');
  assert.equal(st.mode, 'playing');
  T.uiGuard.standDown();
  // A tap.
  startRunAs(7);
  arrive();
  h.pump(30);
  tap(240, 150);
  assert.ok(SG.live && SG.live.skip.ask > 0, 'a tap shows SKIP');
  tap(455, 8);
  assert.equal(SG.live, null, 'a tap on SKIP skips');
  T.uiGuard.standDown();
});

S.check('the wall-clock things that feed the sim wait under the sting: the earned slow time, a magnet sweep', () => {
  startRunAs(2);
  arrive();
  assert.ok(SG.live);
  T.dilation.trigger(0.35, 0.5);
  const p = st.player;
  p.magnetSweep = 1.0;
  const rem = T.dilation.remaining;
  h.pump(30);
  assert.equal(T.dilation.remaining, rem, 'the slow time has not run down');
  assert.equal(p.magnetSweep, 1.0, 'the sweep has not run down');
  playOut();
  h.pump(5);
  assert.ok(T.dilation.remaining < rem && p.magnetSweep < 1.0, 'both run once the fight goes on');
});

S.check('a draft open when the boss arrives: the sting waits for it, then plays', () => {
  startRunAs(2);
  arrive();
  h.pump(10);
  const t = SG.live.t;
  st.pendingDrafts = (st.pendingDrafts || 0) + 1;
  T.openDraft();
  assert.equal(st.mode, 'draft');
  h.pump(30);
  assert.equal(SG.live.t, t, 'the sting waits under the draft');
  kdown('1');
  let g = 0;
  while (st.mode !== 'playing' && g++ < 120) h.pump(1);
  T.uiGuard.standDown();
  assert.equal(st.mode, 'playing');
  assert.ok(SG.live, 'then it plays');
  playOut();
  assert.equal(SG.live, null);
});

S.check('the Maw: the big one, 3.5 s, its name and its line', () => {
  startRunAs(10);
  T.deathCine.startFinale();
  assert.equal(st.mode, 'finale');
  const s = SG.live;
  assert.ok(s && s.kind === 'maw', 'the Maw\'s sting');
  // bossdark: the card draws the Maw with its rim (its hide is dark)
  assert.equal(s.o.cast[0].rim, FINAL_BOSS_SPRITE.rim, 'the Maw wears its rim on the card');
  const t0 = st.time;
  h.pump(130);
  const tx = frame();
  assert.ok(tx.includes(FINAL_BOSS.name.toUpperCase()), tx.join('|'));
  assert.ok(tx.includes('THE FINALE'));
  assert.equal(st.time, t0, 'the finale waits for it');
  const frames = 131 + playOut();
  assert.ok(frames >= 205 && frames <= 215, 'about 3.5 s: ' + frames);
  assert.ok(heard('mawSting') !== undefined);
  h.pump(2);
  assert.ok(st.time > t0, 'then the fight');
});

S.check('a death right after an arrival: the death movie films the killer, nothing of the sting is left', () => {
  startRunAs(2);
  const [boss] = arrive();
  playOut();
  const p = st.player;
  p.invuln = 0; p.hp = 1;
  let g = 0;
  while (st.mode === 'playing' && g++ < 600) { boss.x = p.x; boss.y = p.y; h.pump(1); if (st.mode === 'playing') p.invuln = 0; }
  assert.equal(st.mode, 'death-cine', 'the death movie: ' + st.mode);
  assert.ok(T.movies.current.opts.killer, 'with its killer');
  assert.equal(SG.live, null);
  h.skipMovie();
  T.uiGuard.standDown();
});

S.check('a hidden tab ends the sting; an unattended run has none (the banner as before)', () => {
  startRunAs(2);
  arrive();
  assert.ok(SG.live);
  const hide = (on) => { document.visibilityState = on ? 'hidden' : 'visible'; document.hidden = on; T.onVisibilityChange(); };
  T.setPilotMode('AUTO_ALL');
  hide(true);
  try { for (let i = 0; i < 3; i++) { h.advanceClock(50); T.bg.tick(performance.now()); } } finally { hide(false); }
  h.pump(1);
  assert.equal(SG.live, null, 'ended in the hidden tab');
  // Unattended.
  T.auto.on = true; T.auto.runsInRow = 1; T.auto.restart();
  h.pump(2);
  st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9; st.player.invuln = 1e6;
  assert.equal(st.unattended, true);
  st.wave.num = 2;
  arrive();
  assert.equal(SG.live, null, 'no sting when nobody watches');
  frame();
  assert.ok(T.renderer.bossBanner && T.renderer.bossBanner.letterbox, 'the banner as before');
  T.auto.on = false;
});

S.check('the card is drawn under the HUD; the HUD rows that stand on it step off it; it stays clear of the hero', () => {
  startRunAs(2);
  const [boss] = arrive();
  h.pump(45);
  const s = SG.live;
  assert.ok(s, 'the sting is up');
  const tx = [];
  frame((rec) => { for (const t of rec.texts) tx.push(t); });
  const name = tx.findIndex(t => t.txt === boss.name.toUpperCase());
  const clock = tx.findIndex(t => T.renderer.hudChrome && t.txt === T.renderer.hudChrome.clock.text);
  assert.ok(name >= 0 && clock >= 0, 'both drawn');
  assert.ok(name < clock, 'the card is under the HUD (name ' + name + ', clock ' + clock + ')');
  // The hole: the HUD rows are not drawn on the card, and the radar steps out.
  const hole = st.hudHole;
  assert.ok(hole && hole.w > 400 && hole.h > 60, 'the HUD keeps off the card: ' + JSON.stringify(hole));
  assert.equal(T.renderer.radar, null, 'the radar stands down under it');
  if (s.o.slot !== 'top') assert.equal(hole.y + hole.h, 300, 'on the bottom bar the hole runs to the edge (no HUD marks on the bar)');
  // The HUD chrome is drawn through a clip that cuts the card's rect out.
  {
    const g0 = T.renderer.ctx;
    const clips = [];
    let path = [];
    T.renderer.ctx = new Proxy(g0, {
      get(t, p) {
        if (p === 'beginPath') return () => { path = []; };
        if (p === 'rect') return (x, y, w, h) => path.push({ x, y, w, h });
        if (p === 'clip') return (rule) => clips.push({ rule, path: path.slice() });
        return g0[p];
      },
      set() { return true; },
    });
    try { frame(); } finally { T.renderer.ctx = g0; }
    const cut = st.hudHole;
    assert.ok(clips.some(c => c.rule === 'evenodd' && c.path.some(r => r.x === cut.x && r.y === cut.y && r.w === cut.w && r.h === cut.h)),
      'the HUD rows are clipped off the card: ' + JSON.stringify(clips));
  }
  // Clear of the hero, as drawn and at the push's peak.
  const b = STING.cardBounds(s.o);
  const hs = SG.heroOnScreen();
  assert.ok(hs.y + hs.r < b.y || hs.y - hs.r > b.y + b.h, 'the hero is clear: ' + JSON.stringify({ hs, b, slot: s.o.slot }));
  // The hero low in the view (the camera leads up, or stops at a wall): the card goes up.
  s.o.slot = null; st.cam.y -= 70;
  h.pump(1);
  const low = SG.heroOnScreen(), bt = STING.cardBounds(s.o);
  assert.equal(s.o.slot, 'top', 'the card goes up: ' + JSON.stringify({ low, topY: s.o.topY }));
  assert.ok(low.y - low.r > bt.y + bt.h, 'clear of the hero there: ' + JSON.stringify({ low, bt }));
  assert.ok(bt.y >= T.renderer.hudChrome.bars.y + T.renderer.hudChrome.bars.h, 'and under the vitals');
  st.cam.y += 70;
  playOut();
  frame();
  assert.equal(st.hudHole, null, 'the hole goes with it');
  assert.ok(T.renderer.radar, 'the radar is back');
});

S.check('one thing at a time: a forge moment taken in the offer that opened with the arrival plays first, then the sting', () => {
  startRunAs(2);
  st.enemies.length = 0;
  st.weapons.length = 0; st.player.takenStats = {};
  const w = makeWeapon('VOLLEY'); w.level = WEAPON_MAX_LEVEL; w.cd = 1e9; st.weapons.push(w);
  st.player.takenStats[EVOLUTION_DEFS.VOLLEY.partner] = 1;
  for (let i = 0; i < 6 && st.mode === 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'evolve', 'the evolve offer is open');
  T.bossRules.spawnBoss();   // the boss arrives in the same update the offer opened
  assert.ok(SG.live, 'the sting waits under the offer');
  h.pump(10);
  kdown('1');
  assert.ok(T.forge.live, 'the forge moment plays');
  let n = 0, maxT = 0, both = 0;
  while (T.forge.live && n++ < 200) { h.pump(1); if (T.forge.live && SG.live) { maxT = Math.max(maxT, SG.live.t); if (SG.playing) both++; } }
  assert.equal(maxT, 0, 'the sting\'s clock waits under the forge');
  assert.equal(both, 0, 'it does not take the keys under the forge');
  assert.ok(SG.live && SG.live.t === 0, 'then the sting, from its start');
  T.uiGuard.standDown();
  const frames = playOut();
  assert.ok(frames >= 85, 'the whole sting: ' + frames);
});

S.check('a banner or a hint holding the sim stops the sting\'s clock; the banner it stands in for gives no letterbox', () => {
  startRunAs(2);
  arrive();
  h.pump(10);
  const t = SG.live.t;
  assert.ok(st.bossBanner && st.bossBanner.underSting);
  assert.equal(letterboxAlpha(st), 0, 'the APPROACHES letterbox is not drawn under the sting');
  st.bannerHold = 10;
  h.pump(20);
  assert.equal(SG.live.t, t, 'its clock waits for the hold');
  assert.equal(SG.playing, false);
  st.bannerHold = 0;
  h.pump(5);
  assert.ok(SG.live.t > t, 'and runs again after it');
  playOut();
});

S.check('a broken rule is not named on the card; a skip before the boss lands still plays its cue', () => {
  startRunAs(2);
  assert.ok(st.bossRule && !st.bossRule.live);
  st.player.jokers = ['rulebreaker'];   // the RULEBREAKER joker breaks the rule as the boss arrives
  arrive();
  assert.ok(st.bossRule.live && st.bossRule.broken, 'the rule is broken');
  assert.equal(SG.live.o.rule, null, 'no rule on the card');
  playOut();
  st.player.jokers = [];
  // The Maw lands at 1.6 s: a skip at 0.6 s is before it.
  startRunAs(10);
  T.deathCine.startFinale();
  assert.ok(SG.live && SG.live.kind === 'maw');
  audio.AUDIO_TEST.reset(); audio.init();
  assert.equal(heard('mawSting'), undefined);
  h.pump(36);
  kdown('a');   // shows SKIP
  kdown('Escape');
  assert.equal(SG.live, null, 'skipped');
  assert.notEqual(heard('mawSting'), undefined, 'its cue played at the skip');
  T.uiGuard.standDown();
});

S.check('a death in the arrival\'s own update: the death movie carries no sting', () => {
  startRunAs(2);
  T.bossRules.spawnBoss();
  assert.ok(SG.live, 'the sting is up');
  const p = st.player;
  p.invuln = 0; p.hp = 0.001;
  T.die();
  assert.equal(st.mode, 'death-cine');
  assert.equal(SG.live, null, 'the sting ended with the death');
  assert.ok(!(st.bossBanner && st.bossBanner.underSting), 'no banner left marked under it');
  h.skipMovie();
  T.uiGuard.standDown();
});

S.check('the flash-drop clock does not count the time the sting holds the fight', () => {
  startRunAs(2);
  const c0 = SG.cooldownNow(), t0 = st.time;
  arrive();
  assert.ok(SG.live);
  playOut();
  h.pump(20);
  const wall = (SG.cooldownNow() - c0) / 1000, sim = st.time - t0;
  assert.ok(Math.abs(wall - sim) < 0.05, 'the clock moved with the fight: ' + wall.toFixed(3) + ' s vs ' + sim.toFixed(3) + ' s');
});

// Reduced motion: a still card for about a second.
{
  const r = await boot({ storage: [['hordes_onboarded', '1']], stings: true, reducedMotion: true, variant: 'reduced' });
  const RT = r.T, rs = r.state;
  RT.banners.suppressAll();
  r.skipMovie();
  S.check('reduced motion: a still name card for about a second, then the fight', () => {
    RT.auto.on = false;
    RT.startRun(); r.pump(2);
    rs.spawnTimer = 1e9; rs.wave.midAt = rs.time + 1e9; rs.player.invuln = 1e6;
    rs.wave.num = 2;
    rs.wave.endsAt = rs.time;
    let g = 0;
    while (!(rs.wave.bosses || []).some(b => b.hp > 0) && g++ < 600) r.pump(1);
    rs.wave.endsAt = rs.time + 1e9;
    assert.ok(RT.bossSting.live && RT.bossSting.live.o.reduced);
    const t0 = rs.time;
    let n = 0;
    while (RT.bossSting.live && n++ < 200) r.pump(1);
    assert.ok(n >= 57 && n <= 63, 'about 1.0 s: ' + n);
    assert.equal(rs.time, t0, 'the sim held through it');
  });
}

// ---- 3. the same run with the sting on and off ----------------------------------------
// An attended run from a fixed seed: wave 2's boss arrives through the real
// wave timer, and the run goes on for 66 s after it (a flash drop's
// cooldown runs on the wall clock: the sting's hold must not move it). Every sim step's state is logged
// (the sting's held frames add nothing: the sim clock does not move). With the
// sting on and off the logs must match, and the boss arrives at the same sim time.
async function armLog(stings) {
  // 64 frames a second: a frame time that is exact in binary, so the two arms'
  // frame dt are the same to the last bit (at 60 Hz the fake clock's rounding
  // depends on how far it has run, and the sting's held frames move it on).
  const a = await boot({ storage: [['hordes_onboarded', '1']], stings, variant: 'arm' + stings, frameMs: 15.625 });
  const AT = a.T, as = a.state;
  AT.banners.suppressAll();
  a.skipMovie();
  AT.auto.on = false;
  AT.setPilotMode('AUTO_ALL');
  // The sound module is shared by every boot in this file: each arm starts it
  // fresh (its noise buffer and rate limits draw on Math.random and its clock).
  audio.AUDIO_TEST.reset(); audio.init();
  const rnd = mulberry32(777);
  let draws = 0;   // every random draw is counted: one extra draw is a different run
  Math.random = () => { draws++; return rnd(); };
  AT.startRun();
  as.player.stats.maxHp *= 400; as.player.hp = as.player.stats.maxHp;   // a longer fight to compare
  as.wave.num = 2;
  AT.bossRules.setWave(2);
  as.wave.endsAt = as.time + 4;
  // A flash drop's cooldown that runs out 35 s into the fight, after the
  // arrival, in a busy stretch of this seed's fight. Its clock is the wall
  // clock less the sting's hold: with the sting the next roll must come at
  // the same moment of the fight as without it.
  as.lastFlashAt = AT.bossSting.cooldownNow() - FLASH_DROP.cooldownMs + 35000;
  const log = [];
  let last = -1, arrivedAt = null, stung = 0, g = 0;
  while (as.time < 70 && g++ < 64 * 90) {
    if (as.mode === 'draft' || as.mode === 'evolve') { a.key('keydown', { key: '1', preventDefault() {} }); a.pump(1); AT.uiGuard.standDown(); continue; }
    if (as.mode !== 'playing') break;
    a.pump(1);
    if (AT.bossSting.live) stung++;
    if (arrivedAt == null && (as.wave.bosses || []).length) arrivedAt = as.time;
    if (as.time !== last) {
      last = as.time;
      const p = as.player;
      log.push([as.time.toFixed(6), p.hp.toFixed(4), p.x.toFixed(3), p.y.toFixed(3), p.kills, p.level, String(p.xp), as.enemies.length, 'rng' + draws,
        (as.wave.bosses || []).map(b => b.hp.toFixed(2)).join('/')].join(','));
    }
  }
  return { log, arrivedAt, stung, mode: as.mode };
}
{
  const on = await armLog(true);
  const off = await armLog(false);
  S.check('the same seed with the sting on and off: the boss arrives at the same sim time and the run is the same', () => {
    assert.ok(on.stung > 60, 'the sting played in the attended run: ' + on.stung + ' frames');
    assert.equal(off.stung, 0);
    assert.ok(on.arrivedAt != null && on.arrivedAt === off.arrivedAt, 'the same arrival time: ' + on.arrivedAt + ' vs ' + off.arrivedAt);
    assert.ok(on.log.length > 550, 'a real fight was logged: ' + on.log.length + ' steps');
    assert.equal(on.log.length, off.log.length, 'the same number of sim steps');
    const i = on.log.findIndex((l, k) => l !== off.log[k]);
    assert.equal(i, -1, 'first difference at step ' + i + ':\n on  ' + on.log[i] + '\n off ' + off.log[i]);
  });
}

audio.AUDIO_TEST.reset();   // drop the fake so nothing keeps a timer
S.done();
process.exit(0);   // several boots in this file: none may keep the process alive
