// Builds a schema-valid profile with trophies already EARNED (via the game's own
// recordRun), so verify_phone.mjs can show the earned-emblem path. Writes
// /tmp/pw/earned_profile.json; run it from a cwd where the repo's src/ resolves.
import { makeProfile } from '/home/claude/projects/hordes/src/meta.js';
import { recordRun, earnedCount, ACHIEVEMENTS, isEarned, readNamespace } from '/home/claude/projects/hordes/src/achievements.js';
import fs from 'fs';
const p = makeProfile();
const res = recordRun(p, { kills: 1, wave: 1, time: 30, gold: 10, bestWeaponLevel: 1, evolutions: 0, legendaries: 0, survived: false, bossKills: 1, chests: 1, untouchedWave: 1 });
console.log('recordRun:', JSON.stringify(res));
console.log('earnedCount:', earnedCount(p), '/', ACHIEVEMENTS.length);
console.log('FIRST_BLOOD earned:', isEarned(p, 'FIRST_BLOOD'), '| CHESTS_25:', isEarned(p,'CHESTS_25'), '| UNTOUCHED_WAVE:', isEarned(p,'UNTOUCHED_WAVE'));
fs.writeFileSync('/tmp/pw/earned_profile.json', JSON.stringify(p));
console.log('wrote /tmp/pw/earned_profile.json', fs.statSync('/tmp/pw/earned_profile.json').size, 'bytes');
