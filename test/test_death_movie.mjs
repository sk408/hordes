// HORDES - R2 death movie, "the escape that fails".
// Run: node test/test_death_movie.mjs
//
// Pins the rebuild (src/death_cine.js and its wiring in src/main.js):
//   1. the length: about 3.5 s seen before, a held freeze on the first
//      viewing, 1.5 s still card under reduced motion; six shots in order;
//   2. the freeze names the killer and boxes it in red-orange where it stood
//      (contact, shot, boss, the Maw; the horde when nothing is known), and
//      draws the frozen frame of the fight when it has one;
//   3. the road: the killer lunges and connects (a shooter fires from back),
//      the pilot slumps (kneel, then on his side), the horde closes, black;
//   4. its own sound: one cue per shot, each a real sound, on the listening page;
//   5. the real game: the kill sites hand the killer's entity to the freeze
//      (a parked contact killer, a shooter's shot), the road gets the run's
//      stage and the types it met, the cues play in order and the end card
//      follows; reduced motion gets the still card.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, suite } from './_harness.mjs';
import * as D from '../src/death_cine.js';
import { pilotLook, killerLook, MAW_NAME } from '../src/movie_cast.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import * as audio from '../src/audio.js';
import { GROUPS } from '../listen/sfx_scenes.js';
import { SPRITE_CACHE_TEST } from '../src/sprite_cache.js';
import { BOSS_SPRITES } from '../src/bosses.js';

const S = suite('R2 death movie');
const { DANGER, HERO_WARM, INK } = D.DEATH_CINE_TEST.COLORS;
const SC = D.DEATH_CINE_TEST.SCENE;

// A recording context: every filled rect (with its colour) and every text.
function recorder() {
  const rects = [], texts = [], images = [];
  let style = null;
  const g = {
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style }); },
    fillText(t, x, y) { texts.push({ t: String(t), x, y, style }); },
    measureText: (s) => ({ width: String(s).length * 6 }),
    drawImage(img) { images.push(img); },
    save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, moveTo() {}, rect() {}, clip() {}, fill() {},
  };
  return { g, rects, texts, images, text: () => texts.map(q => q.t).join(' | ') };
}
const ROGUE = pilotLook('ROGUE');
const colours = (look) => new Set(Object.values(look.palette));

// ---- 1. the length -----------------------------------------------------------------
S.check('about 3.5 s seen before, a held freeze the first time, 1.5 s for reduced motion', () => {
  assert.equal(D.REPEAT_DURATION, 3500, 'a repeat plays in 3.5 s');
  assert.ok(D.CINE_DURATION <= 4200 && D.CINE_DURATION > D.REPEAT_DURATION, 'the first viewing holds a beat: ' + D.CINE_DURATION);
  assert.equal(D.durationOf({ reduced: true }), D.STILL_DURATION);
  assert.ok(D.STILL_DURATION <= 1500);
  const ORDER = ['FREEZE', 'ROAD', 'LUNGE', 'HIT', 'SLUMP', 'CLOSE'];
  for (const o of [{}, { repeat: true }]) {
    const P = D.phasesOf(o);
    assert.deepEqual(Object.keys(P), ORDER);
    let at = 0;
    for (const k of ORDER) { assert.equal(P[k][0], at, k + ' starts where the last ended'); at = P[k][1]; }
    assert.equal(at, D.durationOf(o), 'the last shot ends the movie');
    const seen = [];
    for (let t = 0; t <= D.durationOf(o) + 20; t += 7) { const p = D.phaseAt(t, o); if (seen[seen.length - 1] !== p) seen.push(p); }
    assert.deepEqual(seen, [...ORDER, 'DONE'], 'every shot in order, then done');
  }
  // Only the freeze is held: every later shot is as long the first time as the next.
  for (const k of ORDER.slice(1)) {
    assert.equal(D.PHASES[k][1] - D.PHASES[k][0], D.REPEAT_PHASES[k][1] - D.REPEAT_PHASES[k][0], k);
  }
  assert.equal(D.PHASES.FREEZE[1] - D.REPEAT_PHASES.FREEZE[1], D.HOLD_MS);
  assert.equal(D.sceneOf(D.PHASES.ROAD[0] + 100, {}), D.REPEAT_PHASES.ROAD[0] + 100, 'after the hold the pictures are the same');
});

// ---- 2. the freeze ---------------------------------------------------------------------
S.check('the freeze names the killer and how, and boxes it in red-orange where it stood', () => {
  const cases = [
    ['contact', killerLook({ typeId: 'CHASER' }), 'CHASER', 'in melee'],
    ['shot', killerLook({ typeId: 'SPITTER' }), 'SPITTER', 'at range'],
    ['drain', killerLook({ typeId: 'TICK' }), 'TICK', 'latched on'],
    ['contact', killerLook({ typeId: 'BRUTE', bossId: 'PYRAXIS' }), 'PYRAXIS', 'in melee'],
    ['contact', killerLook({ cause: 'contact', name: MAW_NAME }), MAW_NAME, 'swallowed you'],
  ];
  for (const [cause, killer, name, how] of cases) {
    assert.ok(killer, name + ' has a look');
    const freeze = { snap: null, scale: 2, hero: { x: 200, y: 160 }, killer: { x: 330, y: 120 } };
    const r = recorder();
    D.render(r.g, 400, cause, { hero: ROGUE, killer, freeze, repeat: true });
    const txt = r.text();
    assert.ok(/KILLED BY/.test(txt) && txt.includes(name), name + ': named (' + txt + ')');
    assert.ok(txt.includes(how), name + ': and how (' + how + ')');
    const nameText = r.texts.find(q => q.t === name);
    assert.equal(nameText.style, DANGER, 'the name is in the danger colour');
    // The box: red-orange marks round the killer's spot, none round the hero's.
    const box = r.rects.filter(q => q.style === DANGER);
    assert.ok(box.length >= 8, name + ': boxed');
    const mx = box.reduce((s, q) => s + q.x + q.w / 2, 0) / box.length;
    const my = box.reduce((s, q) => s + q.y + q.h / 2, 0) / box.length;
    // The camera pushes in on the pair: the marks follow the frame.
    const M = D.DEATH_CINE_TEST.freezeMarks({ freeze }, killer, 400);
    assert.ok(M.cam.k > 1.3, name + ': pushed in (' + M.cam.k.toFixed(2) + 'x)');
    assert.ok(Math.abs(mx - M.killer.x) < 6 && Math.abs(my - M.killer.y) < 6, name + ': the box is centred on it (' + mx.toFixed(0) + ',' + my.toFixed(0) + ')');
    const M0 = D.DEATH_CINE_TEST.freezeMarks({ freeze }, killer, 0);
    assert.deepEqual([M0.killer.x, M0.killer.y, M0.hero.x, M0.hero.y], [330, 120, 200, 160], name + ': it starts on the frame as it stood');
    assert.ok(M.killer.x > M.hero.x && M.killer.y < M.hero.y, name + ': and keeps where each stood');
    // With no frozen frame, the killer is drawn there in its own colours.
    // Its own colours: those the hero does not wear too (the R6 palette shares a few).
    const kc = colours(killer);
    for (const c of colours(ROGUE)) kc.delete(c);
    const own = r.rects.filter(q => kc.has(q.style));
    assert.ok(own.length > 10, name + ': drawn in its own colours');
    const ox = (Math.min(...own.map(q => q.x)) + Math.max(...own.map(q => q.x + q.w))) / 2;
    assert.ok(Math.abs(ox - M.killer.x) < 8, name + ': where it stood (' + ox.toFixed(0) + ' vs ' + M.killer.x.toFixed(0) + ')');
    // The hero has the warm-white ring.
    assert.ok(r.rects.some(q => q.style === HERO_WARM), 'the hero is ringed in warm white');
  }
  const r = recorder();
  D.render(r.g, 400, 'unknown', { hero: ROGUE, repeat: true });
  assert.ok(r.text().includes('THE HORDE'), 'nothing known: the horde did it');
});
S.check('with a frozen frame of the fight, the movie opens on it and does not redraw the actors over it', () => {
  const killer = killerLook({ typeId: 'SPITTER' });
  const snap = { id: 'frozen' };
  const r = recorder();
  D.render(r.g, 300, 'shot', { hero: ROGUE, killer, freeze: { snap, scale: 2, hero: { x: 240, y: 150 }, killer: { x: 400, y: 90 } }, repeat: true });
  assert.ok(r.images.length >= 1 && r.images.every(i => i === snap), 'the frozen frame is drawn');
  assert.equal(r.rects.filter(q => colours(killer).has(q.style)).length, 0, 'no second killer over the real one');
  assert.ok(r.rects.some(q => q.style === DANGER), 'the real one is boxed');
  // A killer off the screen is boxed at the edge, not lost.
  const L = D.DEATH_CINE_TEST.freezeMarks({ freeze: { scale: 2, hero: { x: 240, y: 150 }, killer: { x: 900, y: -200 } } }, killer, 0);
  assert.ok(L.killer.x <= 480 - 10 && L.killer.y >= 16 + 10, 'clamped into view: ' + L.killer.x + ',' + L.killer.y);
  const far = D.DEATH_CINE_TEST.freezeMarks({ freeze: { scale: 2, hero: { x: 100, y: 200 }, killer: { x: 420, y: 40 } } }, killer, 600);
  assert.ok(far.cam.k < 1.3, 'a pair far apart is barely pushed in: ' + far.cam.k.toFixed(2));
  for (const q of [far.hero, far.killer]) assert.ok(q.x >= 0 && q.x <= 480 && q.y >= 16 && q.y <= 300 - 34, 'both stay in view');
});

// ---- 3. the road -------------------------------------------------------------------------
S.check('on the road the killer lunges and connects; a shooter fires from back; a boss leaps', () => {
  const kp = D.DEATH_CINE_TEST.killerPose;
  const enemy = killerLook({ typeId: 'CHASER' }), boss = killerLook({ typeId: 'X', bossId: 'GRAVELMAW' });
  const atHit = kp(SC.HIT[0], 'contact', enemy);
  assert.ok(atHit.d < 1 && Math.abs(atHit.x) < 9 && atHit.lift < 1, 'a contact killer lands on the pilot, in front: d ' + atHit.d.toFixed(2));
  assert.ok(kp(SC.ROAD[0], 'contact', enemy).d > 2.5, 'it starts back in the pack');
  assert.ok(kp((SC.LUNGE[0] + SC.HIT[0]) / 2, 'contact', enemy).lift > 10, 'it leaps');
  assert.ok(kp(SC.HIT[0], 'shot', enemy).d > 2, 'a shooter stays back');
  const b0 = kp(SC.LUNGE[0], 'contact', boss), b1 = kp(SC.HIT[0], 'contact', boss);
  assert.ok(b1.d < b0.d && kp((SC.LUNGE[0] + SC.HIT[0]) / 2, 'contact', boss).air > 20, 'a boss leaps in');
  // The shot: red-orange orb between the shooter and the pilot during the lunge.
  const spit = killerLook({ typeId: 'SPITTER' });
  const r = recorder();
  D.render(r.g, (SC.LUNGE[0] + SC.HIT[0]) / 2, 'shot', { hero: ROGUE, killer: spit, repeat: true });
  assert.ok(r.rects.some(q => q.style === DANGER && q.w >= 6), 'the orb is in flight');
  const r0 = recorder();
  D.render(r0.g, (SC.LUNGE[0] + SC.HIT[0]) / 2, 'contact', { hero: ROGUE, killer: spit, repeat: true });
  assert.ok(!r0.rects.some(q => q.style === DANGER && q.w >= 6), 'no orb for a contact kill');
  // The killer is drawn on the road in its own colours, and the top bar names it.
  const kc = colours(spit);
  assert.ok(r.rects.some(q => kc.has(q.style)), 'the shooter is on the road');
  assert.ok(r.text().includes('SPITTER'), 'the top bar names it');
  // The hit: the pilot flashes white, a red-orange burst, a red-orange wash.
  const rh = recorder();
  D.render(rh.g, SC.HIT[0] + 30, 'contact', { hero: ROGUE, killer: enemy, repeat: true });
  assert.ok(rh.rects.some(q => q.style === '#ffffff'), 'the pilot flashes');
  assert.ok(rh.rects.filter(q => q.style === DANGER).length >= 6, 'the burst');
});
S.check('the pilot slumps: on his knees, then on his side; the horde closes; black', () => {
  for (const pid of ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN']) {
    const ps = D.heroPoses(pilotLook(pid));
    const rows = (g) => g.filter(r => r.some(v => v)).length;
    assert.ok(rows(ps.kneel) < rows(ps.stand), pid + ' kneels lower');
    assert.ok(ps.fallen[0].length > ps.fallen.length, pid + ' lies on his side: ' + ps.fallen[0].length + 'x' + ps.fallen.length);
    const n = (g) => g.reduce((s, r) => s + r.filter(v => v).length, 0);
    assert.equal(n(ps.fallen), n(ps.stand), pid + ': the same pixels, turned');
    // Each pose is drawn in the pilot's colours.
    const pc = colours(pilotLook(pid));
    for (const t of [SC.ROAD[0] + 200, SC.SLUMP[0] + 100, SC.SLUMP[1] - 50]) {
      const r = recorder();
      D.render(r.g, t, 'contact', { hero: pilotLook(pid), killer: killerLook({ typeId: 'CHASER' }), repeat: true });
      assert.ok(r.rects.some(q => pc.has(q.style)), pid + ' drawn at ' + t);
    }
  }
  // The horde gains and closes round him.
  const m = { x: 40, off: 1.2, phase: 0.3 };
  const hd = D.DEATH_CINE_TEST.hordeAt;
  assert.ok(hd(m, 3, SC.CLOSE[1] - 1).d < hd(m, 3, SC.ROAD[0]).d, 'closer at the end');
  assert.ok(Math.abs(hd(m, 3, SC.CLOSE[1] - 1).x) < Math.abs(m.x), 'and in round him');
  // The ground stops.
  const run = D.DEATH_CINE_TEST.runOf;
  assert.ok(run(SC.CLOSE[1]) - run(SC.CLOSE[0]) < 0.001, 'the run has stopped by the close');
  assert.ok(run(SC.LUNGE[0]) > run(SC.ROAD[0]), 'and ran before');
  // The bars close to black.
  const r = recorder();
  D.render(r.g, SC.CLOSE[1] - 5, 'contact', { hero: ROGUE, repeat: true });
  const bars = r.rects.filter(q => q.style === INK && q.w >= 480 && q.h >= 140 && q.h < 300);
  assert.ok(bars.some(q => q.y === 0) && bars.some(q => q.y + q.h === 300), 'the film bars have shut, top and bottom');
  const rEnd = recorder();
  D.render(rEnd.g, D.REPEAT_DURATION, 'contact', { hero: ROGUE, repeat: true });
  assert.deepEqual(rEnd.rects.map(q => q.style), ['#000000'], 'past the end: black');
});

// ---- 4. its own sound --------------------------------------------------------------------------
S.check('each shot has its own sound cue, real, and on the listening page', () => {
  const ids = Object.keys(audio.DEATH_CUES);
  assert.deepEqual(ids.slice().sort(), D.DEATH_CUE_PHASES.slice().sort(), 'one cue per shot');
  const page = GROUPS.flatMap(g => g.items).filter(it => it[0] === 'death').map(it => it[1]);
  assert.deepEqual(page.slice().sort(), ids.slice().sort(), 'every cue is on the listening page');
  const html = fs.readFileSync(new URL('../listen/index.html', import.meta.url), 'utf8');
  for (const k of ids) assert.ok(html.includes("'death:" + k + "'"), k + ' has a name on the page');
  for (const k of ['death:LUNGE', 'death:HIT']) assert.ok(audio.MIX.cueDb[k] < 0, k + ' is trimmed with the roars');
});

// ---- 5. the real game ------------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state, T = h.T;
const played = [];
{
  const real = T.audio.get();
  T.audio.set({ ...real, playDeathCue(ph) { played.push(ph); return real.playDeathCue(ph); } });
}
function startRunAs(pilot) {
  T.getProfile().equippedCharacter = pilot;
  T.startRun();
  h.pump(3);
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.enemies.length = 0;
  const p = st.player;
  p.hp = 1; p.invuln = 0; p.potions.hp = 0;
  return p;
}
const near = (a, b, tol, label) => assert.ok(a && b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol,
  label + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
const viewOf = (e) => {
  const Z = T.deathCine.zoomScale();
  return { x: 240 + (e.x - st.cam.x - 240) * Z, y: 150 + (e.y - st.cam.y - 150) * Z };
};

S.check('a contact death: the freeze boxes the killer where it stood, the road has the run\'s cast, the cues play in order', () => {
  const p = startRunAs('WITCH');
  const k = makeTypedEnemy('CHASER', p.x + 6, p.y, st.time);
  k.hp = k.maxHp = 1e6; k.speed = 0;
  st.enemies.push(k);
  played.length = 0;
  for (let i = 0; i < 30 && st.mode !== 'death-cine'; i++) h.pump(1, () => { if (st.mode !== 'death-cine') { k.x = p.x + 6; k.y = p.y; k.speed = 0; } });
  assert.equal(st.mode, 'death-cine');
  const o = T.movies.current.opts;
  assert.equal(o.killer.id, 'CHASER'); assert.equal(o.killer.name, 'CHASER');
  assert.ok(o.freeze && o.freeze.hero && o.freeze.killer, 'the freeze knows where they stood');
  near(o.freeze.killer, viewOf(k), 1, 'the killer on the frozen frame');
  near(o.freeze.hero, viewOf(p), 1, 'the hero on the frozen frame');
  assert.equal(o.road.stage, st.stage, 'the run\'s stage');
  assert.ok(Array.isArray(o.road.met), 'the types the run met');
  assert.equal(o.reduced, false);
  let frames = 0;
  while (st.mode === 'death-cine' && frames++ < 600) h.pump(1);
  assert.equal(st.mode, 'dead', 'the end card follows');
  assert.deepEqual(played, ['FREEZE', 'ROAD', 'LUNGE', 'HIT', 'SLUMP', 'CLOSE'], 'one cue per shot, in order');
});
S.check('a death to a shot: the shooter far away is the one boxed, not the shot', () => {
  const p = startRunAs('ROGUE');
  const shooter = makeTypedEnemy('SPITTER', p.x + 90, p.y - 40, st.time);
  shooter.hp = shooter.maxHp = 1e6; shooter.speed = 0;
  st.enemies.push(shooter);
  st.enemyShots.push({ x: p.x, y: p.y, vx: 0, vy: 0, damage: 999, age: 0, kind: 'spit',
    src: { typeId: 'SPITTER', bossId: null, name: null, midBoss: false }, from: shooter });
  for (let i = 0; i < 10 && st.mode !== 'death-cine'; i++) h.pump(1, () => { if (st.mode !== 'death-cine') { shooter.x = p.x + 90; shooter.y = p.y - 40; shooter.speed = 0; } });
  assert.equal(st.mode, 'death-cine');
  assert.equal(st.deathBy.cause, 'shot');
  const o = T.movies.current.opts;
  assert.equal(o.killer.id, 'SPITTER');
  near(o.freeze.killer, viewOf(shooter), 1, 'the shooter, where it stood');
  assert.ok(Math.hypot(o.freeze.killer.x - o.freeze.hero.x, o.freeze.killer.y - o.freeze.hero.y) > 60, 'away from the hero');
  T.deathCine.end();
});
S.check('a shooter killed while its shot was in flight is named, but not boxed over empty ground', () => {
  const p = startRunAs('ROGUE');
  const shooter = makeTypedEnemy('SPITTER', p.x + 90, p.y - 40, st.time);
  st.enemies.push(shooter);
  shooter.hp = 0;                          // killed: the game takes it off the field
  for (let i = 0; i < 10 && st.enemies.includes(shooter); i++) h.pump(1);
  assert.ok(!st.enemies.includes(shooter), 'the shooter is gone');
  p.hp = 1; p.invuln = 0;
  st.enemyShots.push({ x: p.x, y: p.y, vx: 0, vy: 0, damage: 999, age: 0, kind: 'spit',
    src: { typeId: 'SPITTER', bossId: null, name: null, midBoss: false }, from: shooter });
  for (let i = 0; i < 10 && st.mode !== 'death-cine'; i++) h.pump(1);
  assert.equal(st.mode, 'death-cine');
  const o = T.movies.current.opts;
  assert.equal(o.killer.id, 'SPITTER', 'still named');
  assert.equal(o.freeze.killer, null, 'no box where nothing stands');
  const r = recorder();
  D.render(r.g, 400, 'shot', o);
  assert.ok(r.text().includes('SPITTER'), 'the caption names it');
  T.deathCine.end();
});
// The same view math at a world zoom above 1 (the player's zoom ladder).
S.check('the freeze maps the killer through the world zoom', () => {
  const p = startRunAs('WITCH');
  const z0 = st.zoom;
  st.zoom = 2;
  try {
    h.pump(2);
    const Z = T.deathCine.zoomScale();
    assert.ok(Z >= 2, 'zoomed in: ' + Z);
    const shooter = makeTypedEnemy('SPITTER', p.x + 50, p.y - 20, st.time);
    shooter.hp = shooter.maxHp = 1e6; shooter.speed = 0;
    st.enemies.push(shooter);
    p.hp = 1; p.invuln = 0;
    st.enemyShots.push({ x: p.x, y: p.y, vx: 0, vy: 0, damage: 999, age: 0, kind: 'spit',
      src: { typeId: 'SPITTER', bossId: null, name: null, midBoss: false }, from: shooter });
    for (let i = 0; i < 10 && st.mode !== 'death-cine'; i++) h.pump(1, () => { if (st.mode !== 'death-cine') { shooter.x = p.x + 50; shooter.y = p.y - 20; } });
    assert.equal(st.mode, 'death-cine');
    const o = T.movies.current.opts;
    assert.equal(o.freeze.scale, Z, 'the freeze knows the zoom');
    near(o.freeze.killer, viewOf(shooter), 1, 'the shooter at zoom ' + Z);
    near(o.freeze.hero, viewOf(p), 1, 'the hero at zoom ' + Z);
    T.deathCine.end();
  } finally { st.zoom = z0; }
});
S.check('a death to a latched Tick boxes the Tick', () => {
  const p = startRunAs('ROGUE');
  p.hp = 0.5; p.invuln = 99;
  const k = makeTypedEnemy('TICK', p.x, p.y, st.time);
  k.hp = k.maxHp = 1e6;
  st.enemies.push(k);
  for (let i = 0; i < 600 && st.mode !== 'death-cine'; i++) h.pump(1, () => { if (st.mode !== 'death-cine') p.invuln = 99; });   // no touch hurts; the drain still bleeds
  assert.equal(st.mode, 'death-cine');
  assert.equal(st.deathBy.cause, 'drain');
  const o = T.movies.current.opts;
  assert.equal(o.killer.id, 'TICK');
  near(o.freeze.killer, viewOf(k), 1, 'the Tick, where it clung');
  T.deathCine.end();
});
// A boss's fan of bolts (the Choir Mother) and a ring nova (Pyraxis): every
// shot knows its shooter, and the one that kills boxes the boss.
for (const [wave, id, kind] of [[2, 'CHOIR_MOTHER', 'bolt'], [6, 'PYRAXIS', 'nova']]) {
  S.check('a death to ' + id + '\'s ' + kind + ': every ' + kind + ' carries the boss, the boss is boxed', () => {
    const p = startRunAs('PALADIN');
    st.wave.num = wave;
    T.bossRules.setWave(wave);
    T.bossRules.spawnBoss();
    const boss = st.enemies.find(e => e.bossId === id);
    assert.ok(boss, id + ' is on the field');
    const keep = () => { p.hp = p.maxHp || 100; p.invuln = 9; boss.hp = boss.maxHp * 0.4; };   // enraged: the hymn fans
    let mine = [];
    for (let i = 0; i < 60 * 30 && !mine.length; i++) {
      h.pump(1, keep);
      mine = st.enemyShots.filter(s => s.kind === kind && s.src && s.src.bossId === id);
    }
    assert.ok(mine.length, id + ' fired');
    for (const s of mine) assert.equal(s.from, boss, 'the ' + kind + ' knows its shooter');
    st.enemyShots.length = 0;
    const s = mine[0];
    s.x = p.x; s.y = p.y; s.vx = 0; s.vy = 0; s.damage = 1e6; s.age = 0;
    st.enemyShots.push(s);
    p.hp = 1; p.invuln = 0;
    for (let i = 0; i < 10 && st.mode !== 'death-cine'; i++) h.pump(1, () => { if (st.mode !== 'death-cine') boss.hp = boss.maxHp * 0.4; });
    assert.equal(st.mode, 'death-cine');
    assert.equal(st.deathBy.cause, 'shot');
    const o = T.movies.current.opts;
    assert.equal(o.killer.kind, 'boss');
    near(o.freeze.killer, viewOf(boss), 1, id + ', where it stood');
    T.deathCine.end();
  });
}
S.check('a death to the Maw boxes the Maw and says it swallowed you', () => {
  const p = startRunAs('WITCH');
  T.deathCine.startFinale();
  for (let i = 0; i < 600 && st.mode !== 'finale'; i++) h.pump(1);
  assert.equal(st.mode, 'finale');
  const maw = st.finalBoss;
  assert.ok(maw, 'the Maw is on the field');
  for (let i = 0; i < 60 * 40 && st.mode !== 'death-cine'; i++) {
    h.pump(1, () => { if (st.mode !== 'death-cine') { st.player.hp = Math.min(st.player.hp, 1); maw.x = st.player.x; maw.y = st.player.y; } });
  }
  assert.equal(st.mode, 'death-cine');
  const o = T.movies.current.opts;
  assert.equal(o.killer.kind, 'maw');
  near(o.freeze.killer, viewOf(maw), 1, 'the Maw, where it stood');
  const r = recorder();
  D.render(r.g, 400, st.deathBy.cause, o);
  assert.ok(r.text().includes('swallowed'), 'swallowed you: ' + r.text());
  T.deathCine.end();
});
S.check('two deaths in a row: the second plays every cue though the first was skipped during the freeze', () => {
  startRunAs('ROGUE');
  T.hurtBy({ cause: 'unknown' });
  T.die();
  played.length = 0;
  h.pump(2);
  assert.deepEqual(played, ['FREEZE'], 'the first movie began');
  T.deathCine.end();                       // skipped during the freeze
  startRunAs('ROGUE');
  T.hurtBy({ cause: 'unknown' });
  T.die();
  played.length = 0;
  let frames = 0;
  while (st.mode === 'death-cine' && frames++ < 600) h.pump(1);
  assert.deepEqual(played, ['FREEZE', 'ROAD', 'LUNGE', 'HIT', 'SLUMP', 'CLOSE'], 'every cue, the freeze\'s too');
});
S.check('the road is built when the movie starts, not on its first road frame', () => {
  startRunAs('ROGUE');
  T.hurtBy({ cause: 'unknown' });
  T.die();
  const o = T.movies.current.opts;
  assert.ok(D.DEATH_CINE_TEST.sceneBuilt(o), 'built before the first frame');
  T.deathCine.end();
});
// (A hidden tab mutes the death cues: test_audio_mix, which has a sound card.)
S.check('the run\'s next death does not box the last run\'s killer', () => {
  const p = startRunAs('PALADIN');
  T.hurtBy({ cause: 'unknown' });
  T.die();
  assert.equal(st.mode, 'death-cine');
  assert.equal(T.movies.current.opts.freeze.killer, null, 'no stale killer from the run before');
  T.deathCine.end();
});
S.check('reduced motion: the still card, 1.5 s, and it still names the killer', () => {
  const mm = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)) });
  try {
    const p = startRunAs('ROGUE');
    const k = makeTypedEnemy('BRUTE', p.x, p.y, st.time);
    k.hp = k.maxHp = 1e6; k.speed = 0;
    st.enemies.push(k);
    for (let i = 0; i < 30 && st.mode !== 'death-cine'; i++) h.pump(1, () => { k.x = p.x; k.y = p.y; k.speed = 0; });
    assert.equal(st.mode, 'death-cine');
    assert.equal(T.movies.current.opts.reduced, true);
    assert.equal(T.deathCine.duration, D.STILL_DURATION);
    const r = recorder();
    D.render(r.g, 700, 'contact', T.movies.current.opts);
    assert.ok(r.text().includes('BRUTE'), 'named');
    let frames = 0;
    while (st.mode === 'death-cine' && frames++ < 300) h.pump(1);
    assert.ok(frames / 60 <= D.STILL_DURATION / 1000 + 0.1, 'over in ' + (frames / 60).toFixed(2) + ' s');
    assert.equal(st.mode, 'dead');
  } finally { window.matchMedia = mm; }
});

// ---- the road killer's outline and a boss's head, read from real pixels ------------
// A small pixel canvas (as test_r3_readable's) turns the sprite cache on, so
// the outline each actor is baked with can be read back.
function parseColour(c) {
  c = String(c);
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255, 255]; }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const q = m[1].split(',').map(Number); return [q[0], q[1], q[2], q.length > 3 ? Math.round(q[3] * 255) : 255]; }
  return [0, 0, 0, 0];
}
class PixelCanvas {
  constructor(w, hh) {
    this.width = w; this.height = hh;
    this.data = new Uint8ClampedArray(Math.max(1, w * hh) * 4);
    const cv = this;
    const base = {
      fillStyle: '#000000', globalAlpha: 1,
      fillRect(x, y, w2, h2) {
        const col = parseColour(this.fillStyle);
        const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(cv.width, Math.floor(x + w2));
        const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(cv.height, Math.floor(y + h2));
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) cv.data.set(col, (yy * cv.width + xx) * 4);
        }
      },
      getImageData() { return { data: new Uint8ClampedArray(cv.data) }; },
      putImageData(img) { cv.data.set(img.data.subarray(0, cv.data.length)); },
      drawImage(img, x, y) {
        if (!(img instanceof PixelCanvas)) return;
        for (let yy = 0; yy < img.height; yy++) {
          for (let xx = 0; xx < img.width; xx++) {
            const i = (yy * img.width + xx) * 4, tx = xx + Math.round(x || 0), ty = yy + Math.round(y || 0);
            if (img.data[i + 3] && tx >= 0 && ty >= 0 && tx < cv.width && ty < cv.height) {
              cv.data.set(img.data.subarray(i, i + 4), (ty * cv.width + tx) * 4);
            }
          }
        }
      },
    };
    this.ctx = new Proxy(base, {
      get(t, k) { return k in t ? t[k] : (typeof k === 'string' ? () => {} : undefined); },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  getContext() { return this.ctx; }
}
const hasColour = (img, rgb, wantAlpha) => {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === rgb[0] && img.data[i + 1] === rgb[1] && img.data[i + 2] === rgb[2] && img.data[i + 3] > 0 &&
        wantAlpha(img.data[i + 3])) return true;
  }
  return false;
};

// Every sprite the road draws, with where it lands, at scene time ts.
function roadSprites(cause, killer, ts) {
  const imgs = [];
  let style = null;
  const g = {
    set fillStyle(v) { style = v; }, get fillStyle() { return style; },
    globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, fillText() {}, measureText: (q) => ({ width: String(q).length * 6 }),
    drawImage(img, x, y, w, hh) { imgs.push({ img, x, y, w: w ?? img.width, h: hh ?? img.height }); },
    save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, moveTo() {}, rect() {}, clip() {}, fill() {},
  };
  D.render(g, ts, cause, { hero: pilotLook('PALADIN'), killer, repeat: true });
  return imgs.filter(d => d.img instanceof PixelCanvas);
}
// The top (or the bottom) of an image's red-orange outline, in view pixels (null: none).
function dangerTop(d, rgb, fromBottom = false) {
  for (let k = 0; k < d.img.height; k++) {
    const yy = fromBottom ? d.img.height - 1 - k : k;
    for (let xx = 0; xx < d.img.width; xx++) {
      const i = (yy * d.img.width + xx) * 4;
      if (d.img.data[i + 3] === 255 && d.img.data[i] === rgb[0] && d.img.data[i + 1] === rgb[1] && d.img.data[i + 2] === rgb[2]) {
        return d.y + (yy * d.h) / d.img.height;
      }
    }
  }
  return null;
}
function withPixels(fn) {
  const had = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = PixelCanvas;
  SPRITE_CACHE_TEST.reprobe();
  try { fn(); } finally {
    if (had === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = had;
    SPRITE_CACHE_TEST.reprobe();
  }
}
S.check('on the road the killer keeps its red-orange outline, and only the killer has it', () => {
  const dz = parseColour(DANGER);
  withPixels(() => {
    for (const [cause, killer] of [['contact', killerLook({ typeId: 'CHASER' })], ['shot', killerLook({ typeId: 'SPITTER' })],
      ['contact', killerLook({ typeId: 'BRUTE', bossId: 'GRAVELMAW' })], ['contact', killerLook({ cause: 'contact', name: MAW_NAME })]]) {
      for (const ts of [SC.ROAD[0] + 600, SC.LUNGE[0] + 200, SC.SLUMP[0] + 400]) {
        const red = roadSprites(cause, killer, ts).filter(d => hasColour(d.img, dz, (al) => al === 255));
        assert.equal(red.length, 1, killer.name + ' at ' + ts + ': one red-orange outline, ' + red.length);
      }
    }
  });
});
S.check('a boss or the Maw on the road: its head stays under the top film bar from the lunge to the fall', () => {
  const dz = parseColour(DANGER), { BAR } = D.DEATH_CINE_TEST;
  withPixels(() => {
    const looks = [...Object.keys(BOSS_SPRITES).map(id => killerLook({ typeId: 'BRUTE', bossId: id })), killerLook({ cause: 'contact', name: MAW_NAME })];
    for (const killer of looks) {
      for (let ts = SC.LUNGE[0]; ts < SC.SLUMP[1]; ts += 50) {
        const red = roadSprites('contact', killer, ts).map(d => dangerTop(d, dz)).filter(v => v !== null);
        assert.ok(red.length, killer.name + ' drawn at ' + ts);
        assert.ok(Math.min(...red) >= BAR, killer.name + ' at ' + ts + ' ms: top ' + Math.min(...red).toFixed(1) + ' above the bar ' + BAR);
        // Not pushed down instead: it stands on the road, its feet in the picture.
        const feet = roadSprites('contact', killer, ts).map(d => dangerTop(d, dz, true)).filter(v => v !== null);
        assert.ok(Math.max(...feet) <= D.DEATH_CINE_TEST.H - BAR, killer.name + ' at ' + ts + ' ms: feet at ' + Math.max(...feet).toFixed(1));
      }
    }
  });
});

// integ5: the road's KILLED BY line read at about 7 px on a phone held upright.
// It grows there like the freeze's caption (about 11 CSS px), and its capitals
// still fit the top film bar. A sideways phone and the desktop keep 9 px.
S.check('the road\'s KILLED BY line is readable on a phone held upright and fits the top bar', () => {
  const { BAR } = D.DEATH_CINE_TEST;
  const lineAt = (capScale) => {
    const said = [];
    let font = '';
    const g = {
      fillStyle: null, globalAlpha: 1, textAlign: '', textBaseline: '',
      set font(v) { font = v; }, get font() { return font; },
      fillRect() {}, measureText: (q) => ({ width: String(q).length * 0.6 * (parseFloat(/(\d+)px/.exec(font)[1])) }),
      fillText(t, x, y) { said.push({ t: String(t), x, y, px: parseFloat(/(\d+)px/.exec(font)[1]) }); },
      drawImage() {}, save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, moveTo() {}, rect() {}, clip() {}, fill() {},
    };
    D.render(g, SC.ROAD[0] + 400, 'contact', { hero: ROGUE, killer: killerLook({ typeId: 'BRUTE' }), repeat: true, capScale });
    const k = said.find(q => q.t === 'KILLED BY'), n = said.find(q => q.t === 'BRUTE');
    assert.ok(k && n, 'the line is drawn at capScale ' + capScale);
    return { k, n };
  };
  for (const w of [390, 375]) {
    const cs = w / 480, { k, n } = lineAt(cs);
    assert.ok(k.px * cs >= 10.5, w + ' wide: KILLED BY reads at ' + (k.px * cs).toFixed(1) + ' CSS px');
    assert.equal(n.px, k.px, 'the name is the same size');
    // Bold capitals are about 0.7 of the size high, centred on the bar's middle.
    assert.ok(k.y - k.px * 0.35 >= 1 && k.y + k.px * 0.35 <= BAR - 1, 'the capitals fit the ' + BAR + ' px bar: ' + k.px + ' px at ' + k.y);
    assert.ok(n.x >= k.x + 9 * 0.6 * k.px, 'the name starts after KILLED BY');
  }
  for (const cs of [1.3, 2.3]) assert.equal(lineAt(cs).k.px, 9, 'unchanged at capScale ' + cs);
});

S.done();
