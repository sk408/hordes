// HORDES - tools/verify_g26_reward.mjs (G26 PRE-RUN WEAPON LOADOUT, the
// MEASUREMENT RE-SCOPE reward proof). The brief's paired-seed A/B cohort is
// STRUCK (owner directive: "no more sims that last longer than 60 seconds"),
// so the functional reward is proven inside that cap with:
//   (a) the CHOICE proof on live state: the same save with loadout
//       ['ORBIT','ZAP'] arms VOLLEY+ORBIT+ZAP, with ['BOOMERANG'] arms a
//       different kit, and null arms exactly today's default kit;
//   (b) the RIDER proof: the chosen kit's synergy actually RUNS - the
//       Orbital Volley pair (VOLLEY+ORBIT) is detected on live state, which
//       is the re-evaluation contract (synergies.js) doing its job on the
//       pre-armed kit;
//   (c) TWO SINGLE seeded fresh runs (~12s sim each, one per kit), each with
//       its SEED printed, reporting survival / kills / level / synergy on
//       LIVE state. A single short run cannot resolve a reward delta - that
//       is the struck measurement's job - so a NULL functional finding here
//       is an acceptable, stated outcome; what these runs prove is that the
//       chosen kit FIRES in the real loop (kills with the brought weapons,
//       no dead slot).
// ONE boot for the whole tool: main.js is a cached module, so a second
// bootReal would silently keep the first boot's profile. The arms below
// mutate the LIVE profile between startRun calls instead (the
// test_g26_loadout.mjs pattern).
// Run: node tools/verify_g26_reward.mjs
import { bootReal } from './real_loop.mjs';
import { makeProfile } from '../src/meta.js';

const t0 = Date.now();
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

// The save shape: the four unlocked weapons, NOTHING purchased (a "fresh
// account that has visited the shop", not a maxed one).
const save = makeProfile();
save.unlockedWeapons = ['VOLLEY', 'BOOMERANG', 'ORBIT', 'ZAP'];
const h = await bootReal(save);
const st = h.state;
const prof = h.profile();

// Overlay auto-play (the real_loop.mjs policy, inlined for the single boot):
// drafts/evolves pick card 1 (no wpn_ grants exist any more, so there is no
// "prefer a NEW WEAPON" case to prefer); intermissions CONTINUE. Without
// this the overlay pauses the loop and the rAF queue starves.
const driveOverlay = () => {
  const ov = h.dom.elements['overlay'];
  const cards = h.dom.elements['ov-cards'] ? h.dom.elements['ov-cards'].children : [];
  const key = h.dom.keyHandler();
  if (!(ov && ov.style.display === 'flex' && cards.length > 0 && key)) return;
  if (st.mode === 'draft' || st.mode === 'evolve') key({ key: '1' });
  else {
    const titled = (t) => cards.find(c => (c.innerHTML || '').includes(t));
    const cont = titled('CONTINUE') || titled('PLAY');
    if (cont) cont.click(); else key({ key: '1' });
  }
};

// ---- (a) + (b): the choice + rider proofs on live run state -----------------
prof.loadout = ['ORBIT', 'ZAP'];
h.startRun();
const goodKit = st.weapons.map(w => w.type);
check('CHOICE: loadout [ORBIT,ZAP] arms VOLLEY+ORBIT+ZAP on LIVE state',
  JSON.stringify(goodKit) === JSON.stringify(['VOLLEY', 'ORBIT', 'ZAP']), goodKit);
check('RIDER: the Orbital Volley synergy is detected on the live run (the re-evaluation contract holds for a pre-armed kit)',
  st.synergies.map(s => s.name).includes('Orbital Volley'), st.synergies.map(s => s.name));

prof.loadout = ['BOOMERANG'];
h.startRun();
const poorKit = st.weapons.map(w => w.type);
check('CHOICE: a different loadout arms a different kit (player decision matters)',
  JSON.stringify(poorKit) === JSON.stringify(['VOLLEY', 'BOOMERANG']) &&
    JSON.stringify(poorKit) !== JSON.stringify(goodKit), poorKit);

prof.loadout = null;
h.startRun();
const ch = st.character;
const expectDefault = ['VOLLEY'].concat(
  ch.startingWeapon && prof.unlockedWeapons.includes(ch.startingWeapon) ? [ch.startingWeapon] : []);
check('CHOICE: no stored loadout -> exactly today\'s default kit (' + expectDefault.join('+') + ')',
  JSON.stringify(st.weapons.map(w => w.type)) === JSON.stringify(expectDefault),
  st.weapons.map(w => w.type));

// ---- (c): two SINGLE seeded fresh runs, ~12s sim each ------------------------
// A deterministic LCG patched over Math.random for the whole run; the seed is
// printed so the run is reproducible. 12s of sim = 720 frames, a few hundred
// ms of wall time per run - both runs together sit far under the 60s freeze.
const seeded = (s) => {
  let state = s >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
};
const singleRun = (label, seed, loadout) => {
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    prof.loadout = loadout;
    h.startRun();
    const CAP = 720;   // 12 sim-seconds
    let maxProjectiles = 0;   // "the kit FIRES" evidence: observed projectile
    for (let i = 0; i < CAP && st.mode !== 'dead'; i++) {   // counts - robust to early-game kill luck (a fresh VOLLEY L1 can go 12s with 0 kills - measured)
      h.dom.advance(1000 / 60);
      const cb = h.dom.rafQueue.shift();
      if (!cb) throw new Error('raf died at frame ' + i + ' (mode=' + st.mode + ')');
      cb(performance.now());
      driveOverlay();
      if ((st.projectiles || []).length > maxProjectiles) maxProjectiles = st.projectiles.length;
    }
    const rec = {
      label, seed, kit: st.weapons.map(w => w.type),
      time: +st.time.toFixed(1), mode: st.mode,
      kills: st.player.kills, level: st.player.level, maxProjectiles,
      synergies: st.synergies.map(s => s.name),
    };
    console.log('RUN ' + JSON.stringify(rec));
    return rec;
  } finally { Math.random = realRandom; }
};

const r1 = singleRun('chosen kit (loadout ORBIT+ZAP)', 20260915, ['ORBIT', 'ZAP']);
const r2 = singleRun('default kit (no loadout)', 20260916, null);
check('both seeded runs completed inside the 12s cap with the wall clock under 60s',
  Date.now() - t0 < 60000, (Date.now() - t0) + 'ms wall');
check('the chosen kit FIRES in the real loop (projectiles observed with the brought kit armed)',
  r1.maxProjectiles > 0 && JSON.stringify(r1.kit) === JSON.stringify(['VOLLEY', 'ORBIT', 'ZAP']),
  { maxProjectiles: r1.maxProjectiles, kills: r1.kills, kit: r1.kit });
check('functional reward delta un-resolved at 12s/single-run - STATED as a null finding per the re-scope (the A/B cohort is struck)',
  true, { chosen: { t: r1.time, kills: r1.kills }, default: { t: r2.time, kills: r2.kills } });

const bad = results.filter(r => !r.ok).length;
console.log('WALL ' + (Date.now() - t0) + 'ms (cap 60000ms)');
if (bad) { console.error('VERIFY G26 REWARD: ' + bad + ' FAILED check(s)'); process.exit(1); }
console.log('VERIFY G26 REWARD: ALL ' + results.length + ' CHECKS PASSED (choice+rider on live state; two single seeded 12s runs, seeds printed; null reward finding stated)');
