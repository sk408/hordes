// R1: wave 1 tells its story once. After the wave-1 boss falls and the hero
// walks into the portal, the run goes straight into THE ESCAPE chase: no
// portal movie first (the chase already shows the hero diving through a
// portal). Wave 2 and later keep the portal movie. Nothing else is lost: the
// boss loot, the escape's gold (once), the music scenes, the intermission,
// the stage rules, the unattended path and reduced motion.
// Run: node test/test_wave1_no_portal_movie.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { payoutFor } from '../src/escape_payout.js';
import { CONFIG as C } from '../src/config.js';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261118);

const S = suite('wave 1: no portal movie');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
T.banners.suppressAll();
const prof = T.getProfile();
const sub = () => el['ov-sub'].innerHTML || '';
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
h.pump(3);
if (st.mode === 'intro') { kdown('x'); h.pump(2); }
prof.achievements.totals.bestGold = 3000;
const PAY = payoutFor(3000);

// Every recorded music cue main.js asks for, and every portal stinger phase.
// (The movie's cue is played and its mode set within one call, so a frame
// watcher alone would not see a movie that is started and then cut.)
const cues = [];
{
  const real = T.audio.get();
  T.audio.set({
    ...real,
    playMusicCue(slot, opts) { cues.push(slot); return real.playMusicCue(slot, opts); },
    playPortalCue(...a) { cues.push('portal-stinger'); return real.playPortalCue(...a); },
  });
}

const freeze = () => { st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9; };
const startRun = () => {
  T.startRun(); h.pump(2); freeze();
  st.wave.endsAt = st.time + 1e9;
  st.player.invuln = 1e6;
};
// The real boss path: the cast spawns, dies, and the reap opens the portal.
function bossDown() {
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 1800) h.pump(1);
  assert.ok((st.wave.bosses || []).some(b => b.hp > 0), 'a live boss cast');
  st.wave.endsAt = st.time + 1e9;
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  g = 0;
  while (!st.portal && g++ < 600) h.pump(1, () => { st.player.invuln = 1e6; });
  assert.ok(st.portal, 'the portal opened');
  assert.equal(st.wave.cinePending, true, 'the movie is queued, as before');
}
// Walk into the portal (place the hero on it) and watch every frame until the
// run leaves play. Returns what each frame showed.
function enterPortal(maxFrames = 60 * 60) {
  const seen = { modes: new Set(), scenes: new Set() };
  let g = 0;
  // A draft (the boss's joker offer, a level-up) can open on the way: take
  // its first card, as a player would.
  while ((st.mode === 'playing' || st.mode === 'draft' || st.mode === 'evolve') && g++ < maxFrames) {
    // (An unattended run takes its own: a key would count as a player here.)
    if (st.mode !== 'playing') { if (!st.unattended) kdown('1'); h.pump(1); continue; }
    if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    h.pump(1, () => {
      st.player.invuln = 1e6;
      seen.modes.add(st.mode);
      seen.scenes.add(T.music.scene());
    });
  }
  seen.modes.add(st.mode);
  seen.scenes.add(T.music.scene());
  return seen;
}
function runOut(mode, maxFrames = 60 * 30, seen = null) {
  let g = 0;
  while (st.mode === mode && g++ < maxFrames) {
    h.pump(1, () => { if (seen) { seen.modes.add(st.mode); seen.scenes.add(T.music.scene()); } });
  }
}

S.check('wave 1: boss kill, portal entry, straight into the escape chase; no portal movie, nothing lost', () => {
  T.auto.on = false;
  startRun();
  assert.equal(st.wave.num, 1);
  const stage0 = st.stage;
  const kills0 = st.runCounts.bossKills;
  bossDown();
  assert.equal(st.runCounts.bossKills, kills0 + 1, 'the boss kill counted');
  assert.ok(st.chests.length >= C.ESCALATION.BOSS.CHESTS, 'the boss chests are on the field');
  const gold0 = prof.gold;
  cues.length = 0;
  const seen = enterPortal();
  assert.ok(!seen.modes.has('portal-cine'), 'no portal movie: ' + [...seen.modes].join(','));
  assert.ok(!seen.scenes.has('portal'), 'no portal music scene (no -12 dB duck, no portal cue)');
  assert.ok(!cues.includes('portal'), 'the portal movie cue does not play at wave 1: ' + cues.join(','));
  assert.ok(!cues.includes('portal-stinger'), 'nor its stingers');
  assert.equal(st.mode, 'escape', 'the chase plays');
  assert.equal(st.wave.cinePending, false, 'the queued movie is spent');
  assert.equal(st.portal, null, 'the portal closed behind the hero');
  assert.equal(el['overlay'].style.display, 'none', 'no menu over the chase');
  assert.equal(T.music.scene(), 'escape', 'the chase brings its own music');
  const cine = T.escape.cine;
  assert.equal(cine.scene.bossId, 'GRAVELMAW');
  assert.equal(cine.scene.stage, stage0);
  assert.equal(cine.scene.payout, PAY);
  runOut('escape', 60 * 30, seen);
  assert.equal(st.mode, 'intermission');
  assert.equal(prof.gold - gold0, PAY, 'the escape gold is banked');
  assert.match(sub(), new RegExp('ESCAPED: \\+' + PAY + ' gold banked'));
  assert.match(el['ov-title'].textContent, /WAVE 1 CLEARED/);
  h.pump(120);
  assert.equal(prof.gold - gold0, PAY, 'and only once');
  assert.ok(!seen.modes.has('portal-cine'));
  kdown('c'); h.pump(2);
  assert.equal(st.mode, 'playing');
  assert.equal(st.wave.num, 2);
  assert.equal(st.stage, stage0, 'wave 2 stays on the stage (travel is after every second wave)');
});

// R2: from wave 2 the portal movie is the 2.5 s beat on the battlefield, from
// the kill (test_portal_beat.mjs pins its timeline).
S.check('wave 2: the portal beat plays, with its cue and music scene, then the intermission (no escape)', () => {
  freeze();
  st.player.invuln = 1e6;
  cues.length = 0;
  bossDown();
  const gold0 = prof.gold;
  assert.equal(st.mode, 'playing', 'no cut away at wave 2');
  assert.ok(T.portalBeat.live, 'the beat plays at wave 2');
  assert.ok(cues.includes('portal'), 'the beat asks for its portal cue at wave 2: ' + cues.join(','));
  assert.equal(T.music.scene(), 'portal', 'the beat keeps its music scene (the duck)');
  const seen = enterPortal();
  assert.equal(st.mode, 'intermission');
  assert.ok(!seen.modes.has('portal-cine'), 'no separate scene');
  assert.ok(!seen.modes.has('escape'), 'no escape after wave 2');
  assert.ok(!/ESCAPED/.test(sub()));
  assert.equal(prof.gold, gold0);
});

S.check('unattended wave 1 (an auto-started run): no movie, the chase pays at once, the intermission continues', () => {
  T.auto.on = true;
  T.setPilotMode('AUTO_ALL');
  T.auto.runsInRow = 1;
  T.auto.restart();      // the run auto-continue starts
  h.pump(2); freeze(); st.wave.endsAt = st.time + 1e9; st.player.invuln = 1e6;
  assert.equal(st.unattended, true);
  assert.equal(st.wave.num, 1);
  bossDown();
  const gold0 = prof.gold;
  const seen = enterPortal();
  assert.ok(!seen.modes.has('portal-cine'), 'no movie: ' + [...seen.modes].join(','));
  assert.equal(st.mode, 'intermission', 'nobody watches: straight to the intermission');
  assert.equal(prof.gold - gold0, PAY, 'paid in full (the first 3 in a row)');
  assert.match(sub(), /ESCAPED/);
  h.pump(Math.round(60 * (C.AUTOPILOT.AUTO_CONTINUE_S + 0.5)));
  assert.equal(st.mode, 'playing', 'auto-continue goes on');
  assert.equal(st.wave.num, 2);
  T.auto.on = false;
});

S.check('reduced motion at wave 1: the still escape card, no movie', () => {
  const mm = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(String(q)) });
  try {
    startRun();
    bossDown();
    const gold0 = prof.gold;
    const seen = enterPortal();
    assert.ok(!seen.modes.has('portal-cine'));
    assert.equal(st.mode, 'escape');
    assert.equal(T.escape.cine.reduced, true);
    runOut('escape');
    assert.equal(st.mode, 'intermission');
    assert.equal(prof.gold - gold0, PAY);
  } finally { window.matchMedia = mm; }
});

S.done();
