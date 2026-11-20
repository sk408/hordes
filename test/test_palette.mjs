// R6 master palette (src/palette.js): the rules a reviewer can check without
// looking. Every fight colour the plan moved is on the palette; a reserved
// colour (danger red-orange, reward cyan-teal, hero warm white) is used only by
// things with its meaning; nothing else comes near a reserved family; the four
// pilots share no body colour with an enemy, a shot or the damage numbers; the
// player's fire stays out of the danger family.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../src/palette.js';
import { PLAN, resolvePlan } from '../tools/palette_snap.mjs';
import { CHARACTER_SPRITES } from '../src/character_sprites.js';
import { ENEMY_SPRITES } from '../src/enemy_sprites.js';
import { BOSS_SPRITE } from '../src/sprites.js';
import { BOSS_SPRITES } from '../src/bosses.js';
import { FINAL_BOSS_SPRITE } from '../src/final_boss.js';
import { ELITE_LOOK } from '../src/enemy_types.js';
import { HERO_WARM, SHOT_PAINT, GEM_TIERS, GEM_RICH, paintProjectileBody } from '../src/render.js';
import { NUM_PAL } from '../src/fx/feel_render.js';
import { PORTAL_PALETTE } from '../src/art/portal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok - ' + name); } catch (e) { console.log('  FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const lc = (h) => String(h).toLowerCase();
const bodyOf = (spr) => {
  const cnt = {};
  for (const row of spr.frames[0]) for (const v of row) if (v) cnt[v] = (cnt[v] || 0) + 1;
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => lc(spr.palette[k]));
};
const fillsOf = (paint) => { const out = []; paint({ set fillStyle(v) { out.push(lc(v)); }, fillRect() {} }, 0, 0); return out; };

check('the shared ramps and the reserved families: 40 to 64 colours (plus the pickups\' own)', () => {
  const n = P.SHARED.length + Object.values(P.RESERVED).flat().length;
  assert(n >= 40 && n <= 64, 'count ' + n);
  assert(Object.values(P.OWNED).flat().length <= 12, 'owned ramps stay small');
});

check('nothing outside a reserved family comes within RESERVED_DE of it (the gems are reward things)', () => {
  const bad = [];
  for (const h of [...P.SHARED, ...P.OWNED.POTION]) {
    const r = P.nearestReserved(h);
    if (r.de < P.RESERVED_DE) bad.push(h + '~' + r.step + ' ' + r.de.toFixed(1));
  }
  assert(bad.length === 0, bad.join(', '));
});

// The plan names its ranges by anchors (text on a line), so moved lines do not
// move them; a missing or doubled anchor fails, naming it.
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let RESOLVED = null;
check('every anchor of the palette plan is found on exactly one line, and every range is in order', () => {
  RESOLVED = resolvePlan(readSrc);
  assert(RESOLVED.length === PLAN.length, 'resolved ' + RESOLVED.length + ' of ' + PLAN.length);
});
check('the plan follows moved lines: 20 blank lines at the top of a file shift its ranges by 20 and nothing else', () => {
  for (const f of new Set(PLAN.map(p => p[0]))) {
    const moved = resolvePlan((x) => (x === f ? '\n'.repeat(20) : '') + readSrc(x));
    moved.forEach((r, i) => {
      const o = RESOLVED[i], d = r.file === f ? 20 : 0;
      const top = o.from === 1 && r.file === f;   // a range from the start of the file takes the new lines in
      assert((top ? r.from === 1 : r.from === o.from + d) && r.to === o.to + d, f + ': range ' + i + ' moved wrong');
      assert(JSON.stringify(Object.keys(r.perLine).map(k => k - d)) === JSON.stringify(Object.keys(o.perLine).map(Number)), f + ': exceptions moved wrong');
    });
  }
});
check('a missing or a doubled anchor fails with a message that names it', () => {
  const [file, begin] = PLAN.find(p => p[1]);
  const text = readSrc(file);
  const gone = text.split('\n').filter(l => !l.includes(begin)).join('\n');
  let msg = '';
  try { resolvePlan((x) => (x === file ? gone : readSrc(x))); } catch (e) { msg = e.message; }
  assert(msg.includes('not found') && msg.includes(JSON.stringify(begin)) && msg.includes(file), 'missing: ' + (msg || 'no error'));
  msg = '';
  try { resolvePlan((x) => (x === file ? text + '\n// ' + begin : readSrc(x))); } catch (e) { msg = e.message; }
  assert(msg.includes('found 2 times') && msg.includes(JSON.stringify(begin)), 'doubled: ' + (msg || 'no error'));
  const withExc = PLAN.find(p => p[4] && Object.keys(p[4]).length);
  const exc = Object.keys(withExc[4])[0];
  msg = '';
  try { resolvePlan((x) => readSrc(x).split('\n').filter(l => !(x === withExc[0] && l.includes(exc))).join('\n')); } catch (e) { msg = e.message; }
  assert(msg.includes('exception anchor not found') && msg.includes(JSON.stringify(exc)), 'exception: ' + (msg || 'no error'));
});

check('every colour literal in the moved ranges is a palette colour, used by an owner with its meaning', () => {
  const bad = [];
  for (const { file, from, to, allow, perLine } of RESOLVED || resolvePlan(readSrc)) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    for (let i = from - 1; i < to && i < lines.length; i++) {
      const al = [].concat((i + 1) in perLine ? perLine[i + 1] : allow).filter(Boolean);
      for (const m of lines[i].matchAll(/(['"])(#[0-9a-fA-F]{6})\1/g)) {
        const h = lc(m[2]);
        if (!P.inPalette(h)) { bad.push(file + ':' + (i + 1) + ' ' + h + ' not on the palette'); continue; }
        const fam = P.reservedFamily(h), own = P.ownedRamp(h);
        if (fam && !al.includes(fam)) bad.push(file + ':' + (i + 1) + ' ' + h + ' is ' + fam);
        if (own && !al.includes(own)) bad.push(file + ':' + (i + 1) + ' ' + h + ' belongs to ' + own);
      }
    }
  }
  assert(bad.length === 0, bad.slice(0, 8).join('; '));
});

check('the horde and the pilots wear no reserved colour; bosses only the danger of their threat marks', () => {
  const bad = [];
  for (const [id, s] of Object.entries(ENEMY_SPRITES)) for (const h of Object.values(s.palette)) if (P.reservedFamily(h)) bad.push(id + ' ' + h);
  for (const [id, s] of Object.entries(CHARACTER_SPRITES)) for (const h of Object.values(s.palette)) if (P.reservedFamily(h)) bad.push(id + ' ' + h);
  for (const s of [BOSS_SPRITE, FINAL_BOSS_SPRITE, ...Object.values(BOSS_SPRITES)]) {
    for (const h of Object.values(s.palette)) { const f = P.reservedFamily(h); if (f && f !== 'DANGER') bad.push('boss ' + h + ' ' + f); }
    for (const h of bodyOf(s)) if (P.reservedFamily(h)) bad.push('boss body ' + h);
  }
  assert(bad.length === 0, bad.join(', '));
});

check('the meanings hold: shots are danger, gems and the portal reward, the hero mark warm white', () => {
  for (const [k, paint] of Object.entries(SHOT_PAINT)) assert(P.reservedFamily(fillsOf(paint)[0]) === 'DANGER', 'shot ' + k);
  assert(P.reservedFamily(GEM_TIERS[0][0]) === 'REWARD', 'small gem');
  assert(P.reservedFamily(GEM_RICH.body) === 'REWARD', 'rich gem');
  assert(P.reservedFamily(PORTAL_PALETTE[6]) === 'REWARD', 'portal swirl');
  assert(P.reservedFamily(HERO_WARM) === 'HERO', 'hero mark');
  assert(!P.reservedFamily(ELITE_LOOK.trim), 'the elite ring is gold, not a reserved colour');
});

check('the four pilots share no body colour with an enemy, a boss, a shot or the damage numbers (CIEDE2000 8)', () => {
  const others = [];
  for (const [id, s] of Object.entries(ENEMY_SPRITES)) for (const h of bodyOf(s)) others.push([id, h]);
  for (const s of [BOSS_SPRITE, FINAL_BOSS_SPRITE, ...Object.values(BOSS_SPRITES)]) for (const h of bodyOf(s)) others.push(['boss', h]);
  for (const [k, paint] of Object.entries(SHOT_PAINT)) others.push(['shot ' + k, fillsOf(paint)[0]]);
  for (const [k, v] of Object.entries(NUM_PAL)) others.push(['number ' + k, lc(v[1])]);
  const bad = [];
  for (const [id, s] of Object.entries(CHARACTER_SPRITES)) for (const h of bodyOf(s)) for (const [o, oh] of others) {
    if (P.deltaE(h, oh) < 8) bad.push(id + ' ' + h + ' ~ ' + o + ' ' + oh);
  }
  assert(bad.length === 0, bad.join(', '));
  // and the four stay apart from each other
  const bodies = Object.values(CHARACTER_SPRITES).map(s => bodyOf(s)[0]);
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) assert(P.deltaE(bodies[i], bodies[j]) >= 15, 'pilots ' + bodies[i] + ' ' + bodies[j]);
});

// ---- review fixes (R6 round 2) ---------------------------------------------
// A sprite's colours weighted by pixel count over every frame.
const weightsOf = (spr) => {
  const cnt = {}; let n = 0;
  for (const fr of spr.frames) for (const row of fr) for (const v of row) if (v) { const h = lc(spr.palette[v]); cnt[h] = (cnt[h] || 0) + 1; n++; }
  return Object.entries(cnt).map(([h, c]) => [h, c / n]).sort((a, b) => b[1] - a[1]);
};
const HORDE = Object.entries(ENEMY_SPRITES);
const BOSSES = [['DEFAULT', BOSS_SPRITE], ...Object.entries(BOSS_SPRITES), ['MAW', FINAL_BOSS_SPRITE]];
// Every fill a painter makes (a shot's rim, body and core, not only the first).
const allFills = (paint) => { const out = []; paint(new Proxy({}, { set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') out.push(lc(v)); return true; }, get() { return () => {}; } }), 0, 0); return out.filter(h => /^#[0-9a-f]{6}$/.test(h)); };
const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'src/render.js'), 'utf8');

check('no pilot colour over 5% of its pixels comes within CIEDE2000 8 of an enemy\'s or boss\'s colour over 5%, the elite gold, a shot or a damage number', () => {
  const others = [];
  for (const [id, s] of [...HORDE, ...BOSSES]) for (const [h, f] of weightsOf(s)) if (f >= 0.05) others.push([id, h]);
  for (const [k, paint] of Object.entries(SHOT_PAINT)) for (const h of allFills(paint)) others.push(['shot ' + k, h]);
  for (const [k, v] of Object.entries(NUM_PAL)) for (const h of [].concat(v)) if (/^#[0-9a-f]{6}$/i.test(h)) others.push(['number ' + k, lc(h)]);
  others.push(['elite trim', lc(ELITE_LOOK.trim)], ['elite accent', lc(ELITE_LOOK.accent)]);
  // the live actor path's elite ring (render.js drawEnemySprite)
  const ring = (RENDER_SRC.match(/if \(e\.elite\) return '(#[0-9a-f]{6})'/) || [])[1];   // render.js actorRing
  assert(ring, 'the elite ring literal is found in render.js');
  others.push(['elite ring', lc(ring)]);
  const bad = [];
  for (const [id, s] of Object.entries(CHARACTER_SPRITES)) for (const [h, f] of weightsOf(s)) if (f >= 0.05) {
    for (const [o, oh] of others) if (P.deltaE(h, oh) < 8) bad.push(id + ' ' + h + ' (' + Math.round(f * 100) + '%) ~ ' + o + ' ' + oh);
  }
  assert(bad.length === 0, [...new Set(bad)].slice(0, 10).join('; '));
});

// The pixel-weighted mean colour of a sprite, mixed in linear light.
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const meanOf = (spr) => { const s = [0, 0, 0]; for (const [h, f] of weightsOf(spr)) P.hexRgb(h).forEach((c, i) => { s[i] += lin(c) * f; }); return P.rgbHex(s.map(gam)); };

check('the enemy families stay apart by colour: every horde pair and every boss pair at least CIEDE2000 10 apart', () => {
  const bad = [];
  for (const group of [HORDE, BOSSES]) {
    const m = group.map(([id, s]) => [id, meanOf(s)]);
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
      const d = P.deltaE(m[i][1], m[j][1]);
      if (d < 10) bad.push(m[i][0] + '/' + m[j][0] + ' ' + d.toFixed(1));
    }
  }
  assert(bad.length === 0, bad.join(', '));
});

check('the threat marks are danger: the Maw\'s eye and burning core, the named bosses\' eyes, the wind-up and the Maw\'s telegraph', () => {
  assert(P.reservedFamily(FINAL_BOSS_SPRITE.palette[4]) === 'DANGER', 'the Maw\'s eye ' + FINAL_BOSS_SPRITE.palette[4]);
  assert(P.reservedFamily(FINAL_BOSS_SPRITE.palette[5]) === 'DANGER', 'the Maw\'s core ' + FINAL_BOSS_SPRITE.palette[5]);
  for (const id of ['GRAVELMAW', 'HERALD']) assert(P.reservedFamily(BOSS_SPRITES[id].palette[4]) === 'DANGER', id + ' eyes');
  const tele = [
    [/blitGlow\(g, '(#[0-9a-f]{6})', Math\.round\(bw \* \(e\.boss/, 'the wind-up glow'],
    [/if \(tele\) return '(#[0-9a-f]{6})'/, 'the wind-up ring'],
    [/g\.fillStyle = blink \? '#ffffff' : '(#[0-9a-f]{6})';[^\n]*\n\s+g\.fillRect\(x - 1, sy - 11/, 'the wind-up mark'],
    [/blitGlow\(g, fb\.telegraph \? '(#[0-9a-f]{6})'/, 'the Maw\'s telegraph glow'],
    [/mawTele \? '(#[0-9a-f]{6})'/, 'the Maw\'s telegraph ring'],
  ];
  for (const [re, what] of tele) {
    const m = RENDER_SRC.match(re);
    assert(m, what + ': line not found');
    assert(P.reservedFamily(m[1]) === 'DANGER', what + ' is ' + m[1]);
  }
});

// Every file that draws in a fight, scanned whole (not only the PLAN ranges).
const FIGHT_FILES = ['src/render.js', 'src/sprites.js', 'src/enemy_sprites.js', 'src/enemy_types.js', 'src/bosses.js', 'src/final_boss.js',
  'src/character_sprites.js', 'src/fx/feel.js', 'src/fx/feel_render.js', 'src/art/portal.js', 'src/art/arches.js', 'src/fusions.js',
  'src/boss_sting.js', 'src/portal_beat.js', 'src/death_cine.js', 'src/forge_show.js',
  // integ4: the light layer and the Maw's arena, and the art they light (floor, buildings,
  // props, sites, world marks, terrain, chests) are on screen in every fight too.
  'src/light.js', 'src/finale_arena.js', 'src/world_ground.js', 'src/stage_buildings.js', 'src/stage_props.js',
  'src/sites_art.js', 'src/world_art.js', 'src/terrain_art.js', 'src/art/chests.js'];
// An exact reserved step is allowed on a line that says what it is for.
const MEANING = {
  DANGER: /shotOrb|tele|Tele|wind-up|eyes?\b|eye glow|burning core|DANGER/,
  REWARD: /gem|portal|teal|reward|addSparks\(f, p\.x, p\.y \+ 2/i,
  HERO: /HERO_WARM/,
};
// Near a reserved family but kept, each with its reason (file + colour).
const KNOWN = {
  'src/render.js #3fe6d2': 'the hand fan in the HUD: reward teal (the HUD keeps its colours)',
  'src/render.js #c8eee8': 'the hand fan in the HUD (the HUD keeps its colours)',
  'src/render.js #7dffd0': 'the first-run potion\'s beacon and the HUD pickup ping: pickup glints, reward by meaning',
  'src/render.js #ff8848': ['the fusion moment\'s flash over the fight: reported for a ruling', /m\.kind === 'finale'/],
  'src/sprites.js #d8e8f0': 'a weather icon in the HUD (the HUD keeps its colours)',
  'src/art/arches.js #d8f0ff': 'the magnet arch\'s glint: reported for a ruling',
  'src/art/arches.js #e8ffff': 'an arch\'s pale glint: reported for a ruling',
  'src/art/arches.js #e0ffe8': 'an arch\'s pale glint: reported for a ruling',
  'src/fusions.js #d8f4ff': 'a fused weapon\'s pale tint: reported for a ruling',
  'src/fusions.js #e8ffff': 'a fused weapon\'s pale tint: reported for a ruling',
  'src/fusions.js #3ad8c0': 'a fused weapon\'s teal tint: reported for a ruling',
  'src/fusions.js #ffd0d0': 'a fused weapon\'s pale tint: reported for a ruling',
  'src/boss_sting.js #ff6a3a': 'the sting\'s danger: same meaning, dE 4 off the step (the Maw wears both steps)',
  'src/boss_sting.js #3fe6d2': 'the sting\'s reward teal: same meaning',
  'src/portal_beat.js #ff6a3a': 'the beat\'s danger: same meaning',
  'src/portal_beat.js #3fe6d2': 'the beat\'s reward teal: same meaning',
  'src/portal_beat.js #1f8f86': 'the beat\'s dim teal: same meaning',
  'src/death_cine.js #ff5a1f': 'the death movie\'s danger: same meaning (the Maw wears both steps)',
  'src/death_cine.js #8a2208': 'the death movie\'s dark danger: same meaning',
  'src/forge_show.js #3fe6d2': 'the forge moment\'s reward teal: same meaning',
  'src/forge_show.js #1f8f86': 'the forge moment\'s dim teal: same meaning',
  'src/forge_show.js #dff6ef': 'the forge moment\'s pale teal: same meaning',
  'src/forge_show.js #9fd8ca': 'the forge moment\'s teal: same meaning',
  // The light's own colours with a meaning: each only on its own line, so a fire or a
  // window given one of them fails.
  'src/light.js #ff4a1e': ['the enemy shots\' light: danger, same meaning', /^\s*enemyShot: /],
  'src/light.js #ffe2c8': ['the hero\'s light: warm white, same meaning', /^\s*hero: /],
  'src/light.js #3ee8cc': ['the portal\'s light: reward, same meaning', /^\s*portal: /],
  'src/light.js #e8481e': ['a key: the art\'s ember colour, whose light is amber #ff9a40', /'#e8481e': '#ff9a40'/],
  // World art from before the palette pass (fires, embers, frost and glints in the
  // stage art). Each sits near a reserved family; kept and reported for a ruling.
  'src/world_ground.js #eaf3fb': 'Snowfield stone tops: a pale ice white, reported for a ruling',
  'src/world_ground.js #f3f6f9': 'Whiteout drifts: snow white, reported for a ruling',
  'src/world_ground.js #b04818': 'Cinder Maw ground accent: ember, reported for a ruling',
  'src/world_ground.js #8a3212': 'Cinder Maw cracks: dim ember, reported for a ruling',
  'src/world_ground.js #a8461a': 'Cinder Maw cracks\' hot edge: ember, reported for a ruling',
  'src/stage_buildings.js #e8481e': 'building embers (the light turns them amber), reported for a ruling',
  'src/stage_buildings.js #e8d8c0': 'bone-white trim on ossuary arches, reported for a ruling',
  'src/stage_props.js #e8481e': 'the ember brazier\'s coals (the light turns them amber), reported for a ruling',
  'src/stage_props.js #e8d8c0': 'the void candelabra\'s candles, reported for a ruling',
  'src/stage_props.js #9effe0': 'the storm vane\'s spark: mint near reward, reported for a ruling',
  'src/sites_art.js #f0fcff': 'the shrine\'s pale highlight, reported for a ruling',
  'src/sites_art.js #d8f4ff': 'a shrine\'s glint, reported for a ruling',
  'src/sites_art.js #ff8a3a': 'the lever\'s map mark, reported for a ruling',
  'src/world_art.js #ff6a3a': 'the lever not yet pulled: an orange arrow, reported for a ruling',
  'src/terrain_art.js #ff8a4a': 'Cinder Maw ledges\' lit edge, reported for a ruling',
  'src/terrain_art.js #ff6a2a': 'a forge prop\'s flame, reported for a ruling',
  'src/terrain_art.js #e8f6ff': 'icicles, reported for a ruling',
  'src/terrain_art.js #ff7a2a': 'a forge prop\'s fire and slag, reported for a ruling',
  'src/terrain_art.js #c4501e': 'a forge prop\'s slag, reported for a ruling',
  'src/art/chests.js #ff5e3e': 'a cursed chest\'s red glint, reported for a ruling',
};

check('in every fight file, a colour near a reserved family is that family\'s own step on a line with its meaning, or a known kept one', () => {
  const bad = [];
  for (const file of FIGHT_FILES) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      const code = line.replace(/\/\/[^'"]*$/, '');
      const lits = [...code.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => lc(m[0]));
      for (const m of code.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) lits.push(P.rgbHex([+m[1], +m[2], +m[3]]));
      for (const h of lits) {
        if (P.ownedRamp(h) === 'GEM') continue;   // the gem tiers are reward things
        const r = P.nearestReserved(h);
        if (r.de >= P.RESERVED_DE) continue;
        const known = KNOWN[file + ' ' + h];   // a reason, or [reason, the line it may sit on]
        if (known && (typeof known === 'string' || known[1].test(line))) continue;
        const fam = P.reservedFamily(h);
        if (!fam) { bad.push(file + ':' + (i + 1) + ' ' + h + ' sits ' + r.de.toFixed(1) + ' from ' + r.fam); continue; }
        if (!MEANING[fam].test(line)) bad.push(file + ':' + (i + 1) + ' ' + h + ' is ' + fam + ' on a line without that meaning');
      }
    });
  }
  assert(bad.length === 0, bad.slice(0, 10).join('; '));
});

check('the fused weapons\' tints stay out of the danger family (the player\'s fire is amber)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/fusions.js'), 'utf8');
  const bad = [];
  for (const m of src.matchAll(/tint: \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/g)) for (const h of [m[1], m[2]]) {
    const r = P.nearestReserved(h);
    if (r.fam === 'DANGER' && r.de < P.RESERVED_DE) bad.push(h + ' ' + r.de.toFixed(1));
  }
  assert(bad.length === 0, bad.join(', '));
});

check('the player\'s fire is amber and gold, never the danger red-orange', () => {
  const bad = [];
  for (const kind of ['ember', 'firepatch', 'javelin', 'seeker', 'mine', 'ricochet', 'boomerang']) {
    for (const age of [0.05, 0.31, 0.6]) {
      const fills = [];
      paintProjectileBody({ set fillStyle(v) { fills.push(lc(v)); }, fillRect() {} }, { kind, age, vx: 1, vy: 0.3, x: 0, y: 0 }, 0, 0, 1);
      for (const h of fills) if (/^#[0-9a-f]{6}$/.test(h) && P.nearestReserved(h).fam === 'DANGER' && P.nearestReserved(h).de < P.RESERVED_DE) bad.push(kind + ' ' + h);
    }
  }
  assert(bad.length === 0, bad.join(', '));
});

check('the CIEDE2000 distance behaves: zero, symmetric, black to white is 100', () => {
  assert(P.deltaE('#ff4a14', '#ff4a14') === 0, 'zero');
  assert(Math.abs(P.deltaE('#ff4a14', '#5fffd8') - P.deltaE('#5fffd8', '#ff4a14')) < 1e-9, 'symmetric');
  assert(P.deltaE('#000000', '#ffffff') > 99 && P.deltaE('#000000', '#ffffff') < 101, 'black to white is 100');
});

console.log(`test_palette: ${passed} checks passed${process.exitCode ? ' (with FAILURES)' : ''}`);
