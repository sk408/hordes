// THE ESCAPE CINEMATIC (src/escape_cine.js, src/escape_cine_art.js,
// src/escape_payout.js): the timeline, the skip, the payout, the cast, the
// reduced-motion card, the sound cues, and the real hand-over through main.js.
// Run: node test/test_escape_cine.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import * as E from '../src/escape_cine.js';
import * as A from '../src/escape_cine_art.js';
import { payoutFor, escapeWorth, hasWrit, PAYOUT_K, WRIT } from '../src/escape_payout.js';
import { SHOP_BY_ID } from '../src/meta.js';
import { STAGES } from '../src/stages.js';
import { ESCAPE_CUES } from '../src/audio.js';
import { HINTS } from '../src/tutorial.js';
import { SPRITE_CACHE_TEST } from '../src/sprite_cache.js';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261003);
const S = suite('test_escape_cine');

const profileWith = (bestGold, writ = false) => ({ gold: 0, purchased: writ ? { escapeskip: 1 } : {},
  achievements: { totals: { bestGold } } });
// A recording 2D context: every draw call, in order.
function recCtx() {
  const calls = [], texts = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'fillRect') return (x, y, w, h) => { calls.push('r' + [x, y, w, h].join(',')); };
      if (p === 'drawImage') return (...a) => { calls.push('i' + a.slice(1).join(',')); };
      if (p === 'fillText') return (s, x, y) => { texts.push({ s: String(s), x, y }); calls.push('t' + s); };
      if (p === 'measureText') return () => ({ width: 0 });
      return typeof p === 'string' ? () => {} : undefined;
    },
    set() { return true; },
  });
  return { ctx, calls, texts };
}
// Run a cinematic to its end at `hz`; returns the payload and the seconds it took.
function play(opts, hz = 60, g = null) {
  let ended = null;
  E.begin({ ...opts, onEnd: (r) => { ended = r; } });
  let n = 0;
  while (!ended && n < hz * 30) { E.frame(g, 1 / hz); n++; }
  return { ended, seconds: n / hz };
}

// ---- the timeline ----------------------------------------------------------------
S.check('the movie runs 8-10 s, the same at 60 Hz and 120 Hz', () => {
  const a = play({ profile: profileWith(900) }, 60), b = play({ profile: profileWith(900) }, 120);
  for (const r of [a, b]) {
    assert.equal(r.ended.result, 'complete');
    assert.ok(r.seconds >= 8 && r.seconds <= 10, 'ran ' + r.seconds.toFixed(2) + ' s');
  }
  assert.ok(Math.abs(a.seconds - b.seconds) <= 1 / 60 + 1e-9, a.seconds + ' vs ' + b.seconds);
  assert.equal(E.DURATION, 9);
});

S.check('the beats: establish 1.5 s, horde 3 s, boss 2.5 s, dive 1 s, card 1 s, end to end', () => {
  const names = ['ESTABLISH', 'HORDE', 'BOSS', 'DIVE', 'CARD'], lens = [1.5, 3, 2.5, 1, 1];
  let t = 0;
  names.forEach((n, i) => {
    assert.equal(E.BEATS[n][0], t, n + ' starts where the last ended');
    assert.ok(Math.abs(E.BEATS[n][1] - E.BEATS[n][0] - lens[i]) < 1e-9, n + ' lasts ' + lens[i]);
    t = E.BEATS[n][1];
  });
  assert.equal(E.beatAt(0), 'ESTABLISH'); assert.equal(E.beatAt(3), 'HORDE'); assert.equal(E.beatAt(6), 'BOSS');
  assert.equal(E.beatAt(7.5), 'DIVE'); assert.equal(E.beatAt(8.5), 'CARD'); assert.equal(E.beatAt(9), 'DONE');
  // The beats inside the picture sit in their own beat.
  assert.ok(A.GLANCE[0] >= E.BEATS.HORDE[0] && A.GLANCE[1] <= E.BEATS.HORDE[1], 'the glance back');
  assert.equal(A.LUNGES.length, 3, 'three lunges miss');
  for (const L of A.LUNGES) assert.ok(L.t0 > E.BEATS.HORDE[0] && L.t0 + A.LUNGE_S < E.BEATS.DIVE[0], 'a lunge at ' + L.t0);
  assert.equal(A.BOSS_T.RISE, E.BEATS.BOSS[0]); assert.equal(A.BOSS_T.LUNGE, E.BEATS.DIVE[0]);
  assert.ok(A.FLASH_T > A.DIVE_T && A.FLASH_T < E.BEATS.CARD[0]);
});

// ---- the skip and the payout -------------------------------------------------------
S.check('a press inside the guard does nothing; after it one press asks and a second that means it skips, paid in full', () => {
  const prof = profileWith(1500);
  let ended = null;
  E.begin({ profile: prof, onEnd: (r) => { ended = r; } });
  assert.equal(E.press(true), false, 'frame 0');
  for (let i = 0; i < 23; i++) E.frame(null, 1 / 60);   // 0.38 s
  assert.equal(E.press(true), false, 'still inside the guard');
  assert.equal(E.current().ask, 0, 'and the guard raises no prompt');
  assert.equal(ended, null); assert.equal(prof.gold, 0);
  for (let i = 0; i < 2; i++) E.frame(null, 1 / 60);    // 0.42 s
  assert.equal(E.press(true), false, 'the first press only asks');
  assert.equal(E.current().ask, E.SKIP_ASK_S);
  assert.equal(ended, null); assert.equal(prof.gold, 0);
  assert.equal(E.press(true), true, 'the second one skips');
  assert.equal(ended.result, 'skip');
  assert.equal(ended.payout, payoutFor(1500)); assert.equal(prof.gold, payoutFor(1500));
  assert.ok(ended.seconds < 0.5);
  assert.equal(E.SKIP_GUARD_S, 0.4); assert.equal(E.SKIP_ASK_S, 2.5);
});

// The chase begins as a boss fight ends, with the player still steering and
// firing: "any key skips" ended it 0.4 s in for Steve (2026-10-03).
S.check('a press that does not mean it never skips, however often; the prompt runs out', () => {
  const prof = profileWith(1500);
  let ended = null;
  E.begin({ profile: prof, onEnd: (r) => { ended = r; } });
  for (let i = 0; i < 30; i++) E.frame(null, 1 / 60);
  for (let i = 0; i < 200; i++) { assert.equal(E.press(false, i % 2 === 0), false); E.frame(null, 1 / 240); }
  assert.equal(ended, null, 'two hundred stray keys and taps');
  assert.equal(prof.gold, 0);
  assert.equal(E.current().askTap, false, 'the prompt remembers what raised it (a key, last)');
  E.press(false, true);
  assert.equal(E.current().askTap, true, 'or a tap');
  for (let i = 0; i < Math.ceil(E.SKIP_ASK_S * 60) + 1; i++) E.frame(null, 1 / 60);
  assert.equal(E.current().ask, 0, 'it is down again after ' + E.SKIP_ASK_S + ' s');
  assert.equal(E.press(true), false, 'too late: a skip key now asks again');
  assert.equal(E.press(true), true);
  assert.equal(ended.result, 'skip');
  assert.equal(prof.gold, payoutFor(1500));
});

S.check('the SKIP button: a box in the top right corner a thumb can hit, away from where the pads were', () => {
  const b = A.SKIP_RECT, hit = A.SKIP_HIT;
  assert.ok(b.x >= hit.x && b.y >= hit.y && b.x + b.w <= hit.x + hit.w && b.y + b.h <= hit.y + hit.h, 'the label sits inside its hit box');
  assert.ok(hit.w >= 100 && hit.h >= 44, 'at least 100 x 44 view pixels');
  assert.equal(hit.x + hit.w, 480); assert.equal(hit.y, 0);
  assert.equal(E.skipHit(b.x + b.w / 2, b.y + b.h / 2), true, 'the label');
  assert.equal(E.skipHit(479, 0), true); assert.equal(E.skipHit(hit.x, hit.h - 1), true);
  for (const [x, y] of [[240, 150], [40, 260], [440, 260], [240, 8], [hit.x - 1, 8], [470, hit.h]]) {
    assert.equal(E.skipHit(x, y), false, x + ',' + y + ' is not the button');
  }
});

S.check('the prompt is drawn only while it is up, and it says what the second press must be', () => {
  const texts = (ask) => {
    const r = recCtx();
    A.drawScene(r.ctx, E.buildScene({ seed: 7, payout: 100 }), 3.0, ask);
    return r.texts.map(t => t.s);
  };
  assert.ok(texts(null).includes('SKIP'), 'the button is always there');
  assert.ok(!texts(null).some(t => /to skip|skips/.test(t)), 'no instruction until a press: ' + texts(null).join(' | '));
  assert.ok(texts({ on: false, tap: false }).every(t => !/to skip/.test(t)));
  assert.ok(texts({ on: true, tap: false }).includes('ESC or ENTER to skip'));
  assert.ok(texts({ on: true, tap: true }).includes('tap SKIP to skip'));
});

S.check('the payout is credited exactly once: the end, a skip, an instant finish, a double skip', () => {
  const worth = payoutFor(12000);
  assert.equal(worth, 800);
  // The natural end, then every exit again.
  let prof = profileWith(12000), n = 0;
  let r = play({ profile: prof });
  E.press(); E.skip(); E.finishNow(); E.frame(null, 1);
  assert.equal(prof.gold, worth, 'the end pays once');
  assert.equal(r.ended.payout, worth);
  // A skip, pressed twice.
  prof = profileWith(12000);
  E.begin({ profile: prof, onEnd: () => { n++; } });
  for (let i = 0; i < 40; i++) E.frame(null, 1 / 60);
  E.press(true);
  assert.equal(E.press(true), true); assert.equal(E.press(true), false, 'the next press finds nothing to skip');
  E.skip(); E.finishNow();
  for (let i = 0; i < 600; i++) E.frame(null, 1 / 60);
  assert.equal(prof.gold, worth, 'a double skip pays once'); assert.equal(n, 1, 'one hand-back');
  // An instant finish (a hidden tab, an unattended run).
  prof = profileWith(12000); n = 0;
  E.begin({ profile: prof, onEnd: () => { n++; } });
  E.finishNow(); E.finishNow(); E.skip();
  assert.equal(prof.gold, worth, 'an instant finish pays once'); assert.equal(n, 1);
  assert.equal(E.payload().result, 'complete');
  // A skip from code needs no guard.
  prof = profileWith(12000);
  E.begin({ profile: prof });
  E.skip();
  assert.equal(prof.gold, worth); assert.equal(E.payload().result, 'skip');
});

S.check('the payout rule: floor(best gold / 15); a fresh profile escapes with nothing', () => {
  assert.ok(Math.abs(PAYOUT_K - 1 / 15) < 1e-12);
  assert.equal(payoutFor(0), 0); assert.equal(payoutFor(14), 0); assert.equal(payoutFor(15), 1);
  assert.equal(payoutFor(1500), 100); assert.equal(payoutFor(12000), 800);
  const prof = profileWith(0);
  const r = play({ profile: prof });
  assert.equal(r.ended.payout, 0); assert.equal(prof.gold, 0);
});

S.check('the Escape Writ triples the escape gold, and the shop row says so', () => {
  assert.equal(WRIT.BONUS_PCT, 200); assert.equal(WRIT.SHOP_ID, 'escapeskip');
  assert.equal(payoutFor(1500, true), 300); assert.equal(payoutFor(12000, true), 2400);
  assert.equal(payoutFor(805, true), 53 * 3, 'three times the floored base');
  const prof = profileWith(1500, true);
  assert.equal(hasWrit(prof), true); assert.equal(hasWrit(profileWith(1500)), false);
  assert.equal(escapeWorth(prof), 300);
  const r = play({ profile: prof });
  assert.equal(r.ended.payout, 300); assert.equal(r.ended.writ, true); assert.equal(prof.gold, 300);
  // A skip pays the same bonus.
  const p2 = profileWith(1500, true);
  E.begin({ profile: p2 }); E.skip();
  assert.equal(p2.gold, 300);
  const row = SHOP_BY_ID.escapeskip;
  assert.equal(row.name, 'Escape Writ');
  assert.match(row.desc, /pays three times the gold/);
  assert.ok(!/skip/i.test(row.desc), 'the old skip wording is gone: ' + row.desc);
  assert.equal(row.maxLevel, 1);
});

S.check('a preview pays nothing', () => {
  const prof = profileWith(12000, true);
  const r = play({ profile: prof, test: true });
  assert.equal(r.ended.payout, 0); assert.equal(r.ended.test, true); assert.equal(prof.gold, 0);
});

// ---- the cast ------------------------------------------------------------------------
S.check('the horde is the enemy types the run met; a planted pillar does not run', () => {
  const s = E.buildScene({ seed: 5, stage: 'VERDANT_HOLLOW', met: ['BRUTE', 'PILLAR', 'CHASER', 'SWARMER', 'CHASER'] });
  assert.deepEqual(s.cast, ['SWARMER', 'CHASER', 'BRUTE'], 'quick types lead');
  assert.equal(s.horde.length, E.HORDE_SIZE);
  assert.deepEqual([...new Set(s.horde.map(m => m.type))].sort(), ['BRUTE', 'CHASER', 'SWARMER']);
  assert.deepEqual(s.horde.slice(0, 3).map(m => m.type), s.cast, 'the leaders show every type once');
  assert.ok(s.horde.filter(m => m.type === 'SWARMER').every(m => m.fly), 'bats fly');
  let brutes = 0, chasers = 0;
  for (let seed = 1; seed <= 20; seed++) {
    for (const m of E.buildScene({ seed, met: ['BRUTE', 'CHASER'] }).horde) { if (m.type === 'BRUTE') brutes++; else chasers++; }
  }
  assert.ok(brutes * 1.6 < chasers, 'heavies are few: ' + brutes + ' brutes, ' + chasers + ' chasers');
  // One met type is a horde of that type.
  assert.deepEqual([...new Set(E.buildScene({ met: ['TICK'] }).horde.map(m => m.type))], ['TICK']);
});

S.check('with nothing met, the cast is the stage\'s own pool', () => {
  for (const st of STAGES) {
    const s = E.buildScene({ seed: 9, stage: st.id, met: [] });
    assert.deepEqual([...s.cast].sort(), st.pool.map(([id]) => id).sort(), st.id);
    assert.equal(s.stage, st.id);
  }
  assert.equal(E.buildScene({ stage: 'NO_SUCH_STAGE' }).stage, 'VERDANT_HOLLOW');
  assert.deepEqual(E.castFor(['NOPE', 'PILLAR'], 'BLOOD_RUST'), ['CHASER', 'BRUTE', 'COLOSSUS'], 'unknown ids fall back too');
});

S.check('the boss and the pilot are the run\'s; unknown ones fall back', () => {
  for (const id of ['GRAVELMAW', 'CHOIR_MOTHER', 'PYRAXIS']) assert.equal(E.buildScene({ bossId: id }).bossId, id);
  assert.equal(E.buildScene({ bossId: 'NOPE' }).bossId, 'GRAVELMAW');
  assert.equal(E.buildScene({}).bossId, 'GRAVELMAW');
  for (const id of ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN']) assert.equal(E.buildScene({ character: id }).character, id);
  assert.equal(E.buildScene({ character: 'NOPE' }).character, 'KNIGHT');
});

S.check('the wave gains: the leaders start beyond the crest and end at his heels; the boss rises and looms', () => {
  const s = E.buildScene({ seed: 11, met: ['CHASER', 'DASHER', 'SPITTER'] });
  assert.equal(A.hordePose(s, 0, 0.1), null, 'nothing in sight at the start');
  const seen = (t) => s.horde.filter((m, i) => A.hordePose(s, i, t)).length;
  assert.ok(seen(1.4) > 3 && seen(1.4) < seen(3) && seen(3) <= seen(6.9), 'the wave grows: ' + [seen(1.4), seen(3), seen(6.9)]);
  assert.equal(seen(6.9), E.HORDE_SIZE, 'all of it is in sight by the end');
  const lead = (t) => Math.min(...s.horde.map((m, i) => (s.lungers.includes(i) ? 99 : (A.hordePose(s, i, t) || { d: 99 }).d)));
  assert.ok(lead(2) > lead(4) && lead(4) > lead(6.9), 'the front closes');
  const nearest = Math.min(...s.horde.map((m, i) => (A.hordePose(s, i, 6.95) || { d: 99 }).d));
  assert.ok(nearest > 1.4 && nearest < 2, 'at his heels by the end, never past him: ' + nearest.toFixed(2));
  // Each lunge gets closer than the pack ever does, and misses to one side.
  s.lungers.forEach((i, k) => {
    const L = A.LUNGES[k];
    const p = A.hordePose(s, i, L.t0 + A.LUNGE_S * 0.68);
    assert.ok(p && p.d < 1.15, 'lunge ' + k + ' reaches him: ' + (p && p.d));
    const hero = A.heroPose(s, L.t0 + A.LUNGE_S * 0.6);
    assert.ok(Math.sign(hero.x) === -L.side && Math.abs(hero.x) > 6, 'he dodges away: ' + hero.x.toFixed(1));
  });
  assert.equal(A.bossPose(s, 4.4), null, 'no boss before its beat');
  const b0 = A.bossPose(s, 4.6), b1 = A.bossPose(s, 5.4), b2 = A.bossPose(s, 6.6), b3 = A.bossPose(s, 7.45);
  assert.ok(b0.rise < 0.1 && b1.rise === 1, 'it rises over the crest');
  assert.ok(b2.s > b1.s * 1.8 && b3.s > b2.s * 2, 'and gains, then lunges: ' + [b1.s, b2.s, b3.s].map(v => v.toFixed(1)));
  assert.ok(b2.s * 24 > 120, 'it stands over 120 px tall before the lunge');
  assert.equal(A.bossPose(s, 6.8).tell, true, 'the wind-up shows its tell');
  // The hero: at depth 1 through the chase, looking back once, gone in the dive.
  assert.ok(Math.abs(A.heroPose(s, 3).d - 1) < 1e-9);
  assert.equal(A.heroPose(s, 2.5).glance, true); assert.equal(A.heroPose(s, 3.2).glance, false);
  assert.ok(A.heroPose(s, 7.54).d < 0.6 && A.heroPose(s, 7.54).dive === 1, 'he dives at the camera');
});

// ---- the picture -----------------------------------------------------------------------
S.check('the same seed draws the same frames; nothing reads Math.random or the clock', () => {
  const realRandom = Math.random, realNow = Date.now;
  Math.random = () => { throw new Error('Math.random at draw time'); };
  Date.now = () => { throw new Error('Date.now at draw time'); };
  try {
    const mk = (seed) => E.buildScene({ seed, stage: 'ASHEN_WASTE', character: 'ROGUE', met: ['CHASER', 'DASHER', 'BRUTE', 'SWARMER'], payout: 120 });
    for (const t of [0.1, 0.5, 2, 2.5, 3.9, 4, 5, 6, 6.8, 7.3, 7.5, 7.8, 8.2, 8.9]) {
      const a = recCtx(), b = recCtx(), c = recCtx();
      A.drawScene(a.ctx, mk(77), t); A.drawScene(b.ctx, mk(77), t); A.drawScene(c.ctx, mk(78), t);
      assert.ok(a.calls.length > 40, 't=' + t + ': a full frame (' + a.calls.length + ' calls)');
      assert.deepEqual(a.calls, b.calls, 't=' + t + ': one seed, one picture');
      if (t > 1 && t < 7) assert.notDeepEqual(a.calls, c.calls, 't=' + t + ': another seed differs');
    }
  } finally { Math.random = realRandom; Date.now = realNow; }
});

S.check('every stage, pilot and boss draws through the whole movie', () => {
  let n = 0;
  for (const st of STAGES) {
    for (const [ch, boss] of [['KNIGHT', 'GRAVELMAW'], ['WITCH', 'CHOIR_MOTHER'], ['ROGUE', 'PYRAXIS'], ['PALADIN', 'GRAVELMAW']]) {
      const scene = E.buildScene({ seed: 3 + n, stage: st.id, character: ch, bossId: boss, payout: 50 });
      const r = recCtx();
      for (let t = 0; t < 9; t += 0.37) A.drawScene(r.ctx, scene, t);
      assert.ok(r.calls.length > 1000, st.id + '/' + ch);
      n++;
    }
  }
  assert.equal(n, STAGES.length * 4);
});

S.check('through the sprite cache a frame stays under 480 draw calls', () => {
  SPRITE_CACHE_TEST.forceFakeCanvas();
  try {
    const scene = E.buildScene({ seed: 21, stage: 'SNOWFIELD', met: ['CHASER', 'SWARMER', 'BRUTE', 'DASHER', 'SPITTER', 'WARLOCK', 'TICK', 'COLOSSUS'], payout: 10 });
    let worst = 0;
    for (let t = 0; t < 9; t += 0.11) {
      const r = recCtx();
      A.drawScene(r.ctx, scene, t);
      worst = Math.max(worst, r.calls.length);
    }
    assert.ok(worst < 480, 'the busiest frame: ' + worst + ' calls');
    console.log('  MEASURED busiest frame: ' + worst + ' draw calls');
  } finally { SPRITE_CACHE_TEST.reprobe(); }
});

S.check('the label, the gold and SKIP sit on the top bar; the card names the gold', () => {
  const scene = E.buildScene({ seed: 4, payout: 120 });
  const r = recCtx();
  A.drawScene(r.ctx, scene, 3);
  const find = (s) => r.texts.find(x => x.s === s);
  for (const s of ['ESCAPE', '+120 gold', 'SKIP']) {
    assert.ok(find(s), s + ' is drawn: ' + r.texts.map(x => x.s).join(' | '));
    assert.ok(find(s).y < A.BAR, s + ' sits on the top bar');
  }
  assert.ok(A.SKIP_RECT.y >= 0 && A.SKIP_RECT.y + A.SKIP_RECT.h <= A.BAR && A.SKIP_RECT.x + A.SKIP_RECT.w <= 480);
  const c = recCtx();
  A.drawScene(c.ctx, scene, 8.9);
  assert.deepEqual(c.texts.map(x => x.s), ['ESCAPED', '+120 gold']);
  const w = recCtx();
  A.drawScene(w.ctx, E.buildScene({ seed: 4, payout: 180, writ: true }), 8.9);
  assert.deepEqual(w.texts.map(x => x.s), ['ESCAPED', '+180 gold', 'Escape Writ: +200%']);
  const z = recCtx();
  A.drawScene(z.ctx, E.buildScene({ seed: 4, payout: 0 }), 8.9);
  assert.deepEqual(z.texts.map(x => x.s), ['ESCAPED'], 'no "+0 gold"');
  const p = recCtx();
  A.drawScene(p.ctx, E.buildScene({ seed: 4, test: true }), 8.9);
  assert.deepEqual(p.texts.map(x => x.s), ['ESCAPED', 'TEST: no gold']);
});

S.check('reduced motion: a still card for 1.5 s, then the hand-back, paid in full', () => {
  const prof = profileWith(1500);
  const r = recCtx();
  const cues = [];
  let ended = null;
  E.begin({ profile: prof, reduced: true, onEnd: (x) => { ended = x; }, onCue: (id) => cues.push(id) });
  E.frame(r.ctx, 1 / 60);
  assert.deepEqual(r.texts.map(x => x.s), ['ESCAPED', '+100 gold'], 'the card, with the full amount at once');
  const first = r.calls.slice();
  let n = 1;
  while (!ended && n < 600) { r.calls.length = 0; E.frame(r.ctx, 1 / 60); n++; if (!ended) assert.deepEqual(r.calls, first, 'nothing moves'); }
  assert.ok(Math.abs(n / 60 - E.STILL_S) <= 1 / 60 + 1e-9, 'held ' + (n / 60).toFixed(2) + ' s');
  assert.equal(E.STILL_S, 1.5);
  assert.equal(ended.payout, 100); assert.equal(prof.gold, 100);
  assert.deepEqual(cues, [], 'no chase sounds under a still card');
});

// ---- the sound -------------------------------------------------------------------------
S.check('the cues fire once each, in time order, and every one has a voice', () => {
  const cues = [];
  let t = 0;
  E.begin({ profile: profileWith(900), onCue: (id, arg) => cues.push({ id, arg, t }) });
  while (!E.isEnded()) { t += 1 / 60; E.frame(null, 1 / 60); }
  const ids = cues.map(c => c.id);
  assert.deepEqual([...new Set(ids)].sort(), [...E.ESCAPE_CUE_IDS].sort());
  for (const id of E.ESCAPE_CUE_IDS) assert.equal(typeof ESCAPE_CUES[id], 'function', id + ' has a voice in audio.js');
  const steps = cues.filter(c => c.id === 'STEP');
  assert.ok(steps.length >= 24 && steps.length <= 36, steps.length + ' chase beats');
  assert.deepEqual(steps.map(c => c.arg), steps.map((c, i) => i), 'the beats are numbered');
  const gaps = steps.slice(1).map((c, i) => c.t - steps[i].t);
  assert.ok(gaps[gaps.length - 1] < gaps[0] - 0.08, 'the chase quickens: ' + gaps[0].toFixed(2) + ' to ' + gaps[gaps.length - 1].toFixed(2));
  assert.equal(ids.filter(x => x === 'BOSS').length, A.STOMPS.length, 'a footfall for each stomp');
  for (const one of ['ROAR', 'ESCAPE', 'GOLD']) assert.equal(ids.filter(x => x === one).length, 1, one);
  const at = (id) => cues.find(c => c.id === id).t;
  assert.ok(Math.abs(at('ROAR') - A.BOSS_T.LUNGE) < 0.03, 'the roar at the lunge');
  assert.ok(Math.abs(at('ESCAPE') - A.FLASH_T) < 0.03, 'the sting at the flash');
  assert.ok(at('GOLD') >= E.BEATS.CARD[0], 'the gold on the card');
  assert.ok(steps[steps.length - 1].t < A.BOSS_T.LUNGE, 'the bed stops at the lunge');
});

S.check('a skip plays the gold and nothing after; an instant finish is silent', () => {
  const cues = [];
  E.begin({ profile: profileWith(900), onCue: (id) => cues.push(id) });
  for (let i = 0; i < 60; i++) E.frame(null, 1 / 60);
  const before = cues.length;
  E.press(true);
  assert.deepEqual(cues.slice(before), [], 'asking is silent');
  E.press(true);
  assert.deepEqual(cues.slice(before), ['GOLD']);
  for (let i = 0; i < 600; i++) E.frame(null, 1 / 60);
  assert.equal(cues.length, before + 1);
  cues.length = 0;
  E.begin({ profile: profileWith(900), onCue: (id) => cues.push(id) });
  E.finishNow();
  assert.deepEqual(cues, []);
});

// ---- the hint and the manual -------------------------------------------------------------
S.check('the first-time hint is one short sentence about the cinematic', () => {
  assert.equal(HINTS.escape.text, 'After the boss, your hero runs for the portal and banks escape gold.');
  assert.ok(!/jump|run right/i.test(HINTS.escape.text));
});

// ---- through main.js --------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const prof = T.getProfile();
const sub = () => el['ov-sub'].innerHTML || '';
const kdown = (k, extra = {}) => h.key('keydown', { key: k, preventDefault() {}, ...extra });
const tap = (x = 200, y = 150) => el['game']._ev.pointerdown({ clientX: x, clientY: y, pointerId: 1, preventDefault() {} });
const SKIP_AT = [A.SKIP_RECT.x + A.SKIP_RECT.w / 2, A.SKIP_RECT.y + A.SKIP_RECT.h / 2];
const drawnTexts = () => { h.rec.on = true; h.rec.texts.length = 0; h.pump(1); h.rec.on = false; return h.rec.texts.map(x => x.txt); };
const freeze = () => { st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9; };
const startRun = () => { T.startRun(); h.pump(2); freeze(); st.player.invuln = 1e6; };
h.pump(3);
if (st.mode === 'intro') { kdown('x'); h.pump(2); }
prof.achievements.totals.bestGold = 3000;
const PAY = payoutFor(3000);

S.check('the wave-1 portal hands the run to the cinematic; it ends in the intermission, paid once', () => {
  T.auto.on = false;
  startRun();
  assert.equal(st.wave.num, 1);
  const gold0 = prof.gold;
  st.wave.cinePending = true; st.portal = null;
  h.pump(2);
  assert.equal(st.mode, 'portal-cine');
  kdown('x'); h.pump(1);
  assert.equal(st.mode, 'escape', 'the portal movie hands over');
  const cine = T.escape.cine;
  assert.equal(cine.scene.bossId, 'GRAVELMAW', 'the wave-1 boss');
  assert.equal(cine.scene.stage, st.stage); assert.equal(cine.scene.character, st.character.id);
  assert.equal(cine.scene.payout, PAY);
  assert.equal(el['overlay'].style.display, 'none', 'no menu over the movie');
  h.rec.on = true; h.rec.texts.length = 0; h.rec.rects.length = 0;
  h.pump(60);
  h.rec.on = false;
  assert.ok(h.rec.texts.some(x => x.txt === 'ESCAPE') && h.rec.texts.some(x => x.txt === '+' + PAY + ' gold'), 'the movie is on the canvas');
  assert.ok(!h.rec.texts.some(x => /^(HP|MP|XP|GOLD|LV)\b/.test(x.txt)), 'the run HUD stands down');
  assert.equal(prof.gold, gold0, 'nothing banked mid-movie');
  h.pump(Math.round(60 * (T.escape.duration - 1)) + 2);
  assert.equal(st.mode, 'intermission');
  assert.equal(prof.gold - gold0, PAY, 'the payout reached the bank');
  assert.equal(T.escape.payload.result, 'complete');
  assert.match(sub(), new RegExp('ESCAPED: \\+' + PAY + ' gold banked'));
  assert.equal(el['overlay'].style.display, 'flex', 'the intermission card is up');
  h.pump(120);
  assert.equal(prof.gold - gold0, PAY, 'and only once');
});

S.check('no state leaks: CONTINUE starts wave 2, and the wave-2 portal goes straight to its intermission', () => {
  kdown('c'); h.pump(2);
  assert.equal(st.mode, 'playing'); assert.equal(st.wave.num, 2);
  assert.equal(el['overlay'].style.display, 'none', 'no overlay left over the field');
  freeze();
  const gold0 = prof.gold;
  st.wave.cinePending = true; st.portal = null;
  h.pump(2); kdown('x'); h.pump(2);
  assert.equal(st.mode, 'intermission', 'no escape after wave 2');
  assert.equal(prof.gold, gold0);
  assert.ok(!/ESCAPED/.test(sub()));
});

S.check('a skip key pressed twice skips after the guard, pays once, and the same press does not continue the next screen', () => {
  startRun();
  const gold0 = prof.gold;
  T.escape.start();
  assert.equal(st.mode, 'escape');
  kdown('Enter');
  assert.equal(st.mode, 'escape', 'a press on the first frame is ignored');
  h.pump(30);
  kdown('Enter', { repeat: true });
  assert.equal(T.escape.cine.ask, 0, 'a held key is not a press');
  assert.ok(!drawnTexts().some(t => /to skip/.test(t)), 'no prompt yet');
  kdown('Enter');
  assert.equal(st.mode, 'escape', 'the first press asks');
  assert.ok(drawnTexts().includes('ESC or ENTER to skip'), 'and the movie says how');
  kdown('Enter');
  assert.equal(st.mode, 'intermission');
  assert.equal(prof.gold - gold0, PAY);
  assert.equal(T.escape.payload.result, 'skip');
  assert.equal(T.uiGuard.armed(), true, 'the gesture guard is up for the next screen');
  kdown('x'); kdown('x'); h.pump(5);
  assert.equal(prof.gold - gold0, PAY, 'more presses pay nothing more');
  assert.equal(st.mode, 'intermission');
});

S.check('the keys a player steers and fights with never skip the movie; ESC or SPACE after them does', () => {
  for (const skipKey of ['Escape', ' ']) {
    startRun();
    const gold0 = prof.gold;
    T.escape.start();
    h.pump(30);
    for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'q', 'e', 'h', 'n', 'Tab', 'g', 'o', 'r', 'x']) {
      kdown(key); kdown(key); h.pump(2);
    }
    assert.equal(st.mode, 'escape', 'thirty presses later the chase is still on');
    assert.equal(prof.gold, gold0, 'and nothing is banked yet');
    assert.ok(T.escape.cine.ask > 0, 'they raise the prompt');
    kdown(skipKey);
    assert.equal(st.mode, 'intermission', JSON.stringify(skipKey) + ' while the prompt is up skips');
    assert.equal(prof.gold - gold0, PAY);
  }
});

S.check('a tap raises the prompt; only a tap on SKIP while it is up skips', () => {
  startRun();
  const gold0 = prof.gold;
  T.escape.start();
  tap(...SKIP_AT);
  assert.equal(st.mode, 'escape', 'inside the guard');
  assert.equal(T.escape.cine.ask, 0);
  h.pump(30);
  // Thumbs where the pads were a moment ago, and the middle of the field.
  for (let i = 0; i < 14; i++) { tap(30 + 30 * i, i % 2 ? 150 : 262); h.pump(1); }
  assert.equal(st.mode, 'escape', 'taps on the field never skip');
  assert.ok(drawnTexts().includes('tap SKIP to skip'));
  tap(...SKIP_AT);
  assert.equal(st.mode, 'intermission');
  assert.equal(prof.gold - gold0, PAY);
  tap(); tap(...SKIP_AT); h.pump(2);
  assert.equal(prof.gold - gold0, PAY);
  // SKIP itself, twice, with nothing before it.
  startRun();
  T.escape.start();
  h.pump(30);
  tap(...SKIP_AT);
  assert.equal(st.mode, 'escape', 'the first tap on SKIP asks');
  tap(...SKIP_AT);
  assert.equal(st.mode, 'intermission', 'the second skips');
  // The prompt runs out: SKIP asks again.
  startRun();
  T.escape.start();
  h.pump(30);
  tap();
  h.pump(Math.ceil(60 * E.SKIP_ASK_S) + 2);
  tap(...SKIP_AT);
  assert.equal(st.mode, 'escape', 'a late tap on SKIP asks again');
  T.escape.skip();
  assert.equal(st.mode, 'intermission');
});

S.check('the cast is read from the run: the types it met, its stage and pilot', () => {
  startRun();
  st.wave.met = { CHASER: 1, TICK: 1, PILLAR: 1, WARLOCK: 1 };
  T.escape.start();
  assert.deepEqual(T.escape.cine.scene.cast, ['CHASER', 'TICK', 'WARLOCK']);
  T.escape.skip();
  // A real spawn tick records what it puts on the field.
  startRun();
  st.spawnTimer = 0; st.wave.endsAt = st.time + 1e9;
  h.pump(90);
  const met = Object.keys(st.wave.met || {});
  assert.ok(met.length >= 1, 'the spawner recorded: ' + met.join(','));
  assert.ok(st.enemies.filter(e => !e.boss).every(e => met.includes(e.typeId)), 'every type on the field is in the record');
  freeze(); st.enemies.length = 0;
  T.escape.start();
  assert.deepEqual(T.escape.cine.scene.cast, E.castFor(met, st.stage));
  T.escape.skip();
  assert.equal(st.mode, 'intermission');
  // A new run starts its own record.
  st.wave.met = { COLOSSUS: 1, WARLOCK: 1 };
  T.startRun();
  assert.equal(st.wave.met, undefined, 'nothing is carried into the next run');
  h.pump(2); freeze();
});

// AUTO-CONTINUE on is not "nobody is there": the movie used to be cut for
// every run with the setting on, watched or not.
S.check('auto-continue: a run the player started still shows the chase, then goes on by itself', () => {
  T.auto.on = true;
  T.auto.input();                 // the press that started it
  startRun();
  assert.equal(st.unattended, true);
  assert.equal(T.escape.unwatched, false, 'the player is there');
  const gold0 = prof.gold;
  st.wave.cinePending = true; st.portal = null;
  h.pump(3);
  assert.equal(st.mode, 'escape', 'the chase plays: ' + st.mode);
  h.pump(Math.round(60 * T.escape.duration) + 2);
  assert.equal(st.mode, 'intermission');
  assert.equal(prof.gold - gold0, PAY);
  assert.equal(T.escape.payload.result, 'complete');
  assert.ok(T.escape.payload.seconds >= T.escape.duration - 0.05, 'all of it: ' + T.escape.payload.seconds.toFixed(2) + ' s');
  h.pump(Math.round(60 * 3.2));
  assert.equal(st.mode, 'playing', 'auto-continue goes on into wave 2 with no input');
  assert.equal(st.wave.num, 2);
  T.auto.on = false;
});

S.check('auto-continue: a run it started itself, with no input since, passes straight through: paid in full, in the away summary', () => {
  T.auto.on = true;
  T.auto.runsInRow = 1;           // auto-continue started this one; nobody has pressed anything
  startRun();
  assert.equal(st.unattended, true);
  assert.equal(T.escape.unwatched, true);
  const gold0 = prof.gold, away0 = T.auto.away.gold;
  st.wave.cinePending = true; st.portal = null;
  h.pump(3);
  assert.equal(st.mode, 'intermission', 'straight through both movies: ' + st.mode);
  assert.equal(prof.gold - gold0, PAY);
  assert.equal(T.escape.payload.result, 'complete');
  assert.equal(T.auto.away.gold - away0, PAY, 'the away summary carries the escape gold');
  assert.match(sub(), /ESCAPED: \+\d+ gold banked/);
  h.pump(Math.round(60 * 3.2));
  assert.equal(st.mode, 'playing', 'auto-continue goes on into wave 2');
  assert.equal(st.wave.num, 2);
  assert.equal(prof.gold - gold0, PAY);
  // Any key or tap means somebody is back: the next chase would play.
  T.auto.input();
  assert.equal(T.auto.runsInRow, 0);
  assert.equal(T.escape.unwatched, false);
  T.auto.on = false;
});

S.check('the stall watchdog ends a movie that stands still, paid', () => {
  startRun();
  const gold0 = prof.gold;
  T.escape.start();
  T.escape.hold(2);              // a clock that does not move
  h.pump(30);
  assert.equal(st.mode, 'escape');
  T.auto.unstick('escape');
  assert.equal(st.mode, 'intermission');
  assert.equal(prof.gold - gold0, PAY);
});

S.check('reduced motion: the still card, 1.5 s, then the intermission', () => {
  const mm = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)) });
  try {
    startRun();
    const gold0 = prof.gold;
    T.escape.start();
    assert.equal(T.escape.cine.reduced, true);
    h.rec.on = true; h.rec.texts.length = 0;
    h.pump(1);
    h.rec.on = false;
    assert.deepEqual(h.rec.texts.map(x => x.txt), ['ESCAPED', '+' + PAY + ' gold']);
    h.pump(80);
    assert.equal(st.mode, 'escape', 'still up at 1.35 s');
    h.pump(12);
    assert.equal(st.mode, 'intermission');
    assert.equal(prof.gold - gold0, PAY);
  } finally { window.matchMedia = mm; }
});

S.check('the Escape Writ pays three times as much through the real hand-over', () => {
  prof.purchased.escapeskip = 1;
  startRun();
  const gold0 = prof.gold;
  T.escape.start();
  assert.equal(T.escape.cine.scene.writ, true);
  T.escape.skip();
  assert.equal(prof.gold - gold0, PAY * 3);
  assert.match(sub(), /gold banked \(Escape Writ\)/);
  delete prof.purchased.escapeskip;
});

S.check('a run started by auto-continue banks its escape at the same cut as its gold', () => {
  startRun();
  st.autoStarted = true;
  const gold0 = prof.gold;
  T.escape.start();
  assert.equal(T.escape.cine.scene.payout, Math.floor(PAY / 2));
  T.escape.skip();
  assert.equal(prof.gold - gold0, Math.floor(PAY / 2));
  st.autoStarted = false;
});

S.check('the TEST card previews it, pays nothing and returns to Settings', () => {
  startRun();
  const gold0 = prof.gold;
  kdown('Escape'); h.pump(1);
  assert.equal(st.mode, 'settings');
  T.escape.start({ test: true });
  assert.equal(st.mode, 'escape');
  assert.equal(T.escape.cine.scene.test, true);
  h.pump(40); kdown('x');
  assert.equal(st.mode, 'escape', 'the preview asks before it skips too');
  kdown('Escape');
  assert.equal(st.mode, 'settings');
  assert.equal(prof.gold, gold0);
});

S.check('help mode cannot be armed over the movie, and a fresh profile escapes with no gold line', () => {
  startRun();
  T.escape.start();
  h.pump(10);
  kdown('?');
  assert.equal(st.helpMode, false);
  assert.equal(st.mode, 'escape', 'inside the guard: nothing');
  h.pump(30);
  T.escape.skip();
  const best = prof.achievements.totals.bestGold;
  prof.achievements.totals.bestGold = 0;
  startRun();
  T.escape.start();
  T.escape.skip();
  assert.match(sub(), /^ESCAPED<br>/);
  prof.achievements.totals.bestGold = best;
});

S.check('the first-time hint holds the movie on its first frame; a press answers the hint, not the skip', () => {
  startRun();
  const gold0 = prof.gold;
  T.tut.setHintsEnabled(true);
  try {
    assert.equal(T.tut.seen('hint:escape'), false, 'fixture: the hint is new to this profile');
    T.escape.start();
    h.rec.on = true; h.rec.texts.length = 0; h.rec.rects.length = 0;
    h.pump(2);
    h.rec.on = false;
    assert.ok(T.tut.hints.active && T.tut.hints.active.id === 'escape', 'the hint is up');
    assert.equal(T.tut.hints.active.text, HINTS.escape.text);
    assert.ok(h.rec.rects.length > 40, 'the held frame shows the scene, not a blank (' + h.rec.rects.length + ' rects)');
    const t0 = T.escape.cine.t;
    h.pump(60);
    assert.equal(T.escape.cine.t, t0, 'the clock holds under the hint');
    assert.ok(t0 < E.SKIP_GUARD_S);
    tap();
    assert.equal(st.mode, 'escape', 'a tap on the picture does not skip under the hint');
    kdown('Enter');
    assert.equal(T.tut.hints.active, null, 'Enter answers the hint');
    assert.equal(st.mode, 'escape', 'and does not skip the movie');
    assert.equal(prof.gold, gold0);
    h.pump(30);
    assert.ok(T.escape.cine.t > t0 + 0.4, 'the movie plays on');
    assert.equal(T.escape.cine.ask, 0, 'answering the hint raised no skip prompt');
    kdown('Enter');
    assert.equal(st.mode, 'escape', 'the first press after it asks');
    kdown('Enter');
    assert.equal(st.mode, 'intermission');
    assert.equal(prof.gold - gold0, PAY);
    // Seen once: the next escape starts playing at once.
    startRun();
    T.escape.start();
    h.pump(10);
    assert.equal(T.tut.hints.active, null);
    assert.ok(T.escape.cine.t > 0.1);
    T.escape.skip();
  } finally { T.tut.setHintsEnabled(false); }
});

S.done();
process.exit(0);
