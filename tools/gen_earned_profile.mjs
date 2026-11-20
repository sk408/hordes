// Builds a schema-valid profile with trophies already EARNED (via the game's own
// recordRun), for checks of the earned-emblem path (verify_phone.mjs). It is not a
// progression profile: for a profile with gold spent, use tools/progression_sim.mjs
// --fixed-build or tools/balance/batch.mjs.
// Fixed 2026-11 (balance review): it imported from a VPS path and wrote to /tmp/pw;
// it now reads this checkout's src/ and writes to the system temp folder.
//   node tools/gen_earned_profile.mjs   -> <tmp>/pw/earned_profile.json
import { makeProfile } from '../src/meta.js';
import { recordRun, earnedCount, ACHIEVEMENTS, isEarned } from '../src/achievements.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
const OUT_DIR = path.join(os.tmpdir(), 'pw');
const OUT = path.join(OUT_DIR, 'earned_profile.json');
const p = makeProfile();
const res = recordRun(p, { kills: 1, wave: 1, time: 30, gold: 10, bestWeaponLevel: 1, evolutions: 0, legendaries: 0, survived: false, bossKills: 1, chests: 1, untouchedWave: 1 });
console.log('recordRun:', JSON.stringify(res));
console.log('earnedCount:', earnedCount(p), '/', ACHIEVEMENTS.length);
console.log('FIRST_BLOOD earned:', isEarned(p, 'FIRST_BLOOD'), '| CHESTS_25:', isEarned(p,'CHESTS_25'), '| UNTOUCHED_WAVE:', isEarned(p,'UNTOUCHED_WAVE'));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(p));
console.log('wrote ' + OUT, fs.statSync(OUT).size, 'bytes');
